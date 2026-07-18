// =====================================
// Кабинет сотрудника: записи и клиенты
// =====================================

let employeeId = null;
let currentFilter = "today";
let currentNoteClientId = null;

const EMP_STATUS_LABELS = {
  booked: "Ожидает посещения",
  completed: "Завершено",
  cancelled: "Отменено",
  no_show: "Не пришёл"
};

const EMP_MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];


function empTodayDateString(offset){
  const d = new Date();
  d.setDate(d.getDate() + (offset || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function empFormatDate(dateStr){
  const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
  return `${d} ${EMP_MONTHS_RU[m - 1]} ${y}`;
}

function empFormatTime(timeStr){
  return timeStr.slice(0, 5);
}


// ---------- Записи сотрудника ----------

async function initEmployeeAppointments(){

  const profile = await getProfile();

  if(!profile || (profile.role !== "employee" && profile.role !== "admin")){
    showToast("Доступ только для сотрудников", "error");
    window.location.href = "../login.html";
    return;
  }

  const {data: {user}} = await supabaseClient.auth.getUser();
  employeeId = user.id;

  document.getElementById("filterToday").addEventListener("click", () => setFilter("today"));
  document.getElementById("filterTomorrow").addEventListener("click", () => setFilter("tomorrow"));
  document.getElementById("filterWeek").addEventListener("click", () => setFilter("week"));

  await setFilter("today");
}


function setFilter(filter){
  currentFilter = filter;

  ["filterToday", "filterTomorrow", "filterWeek"].forEach(id => {
    document.getElementById(id).classList.remove("btn-active-filter");
  });

  const activeId = filter === "today" ? "filterToday" : filter === "tomorrow" ? "filterTomorrow" : "filterWeek";
  document.getElementById(activeId).classList.add("btn-active-filter");

  return loadEmployeeAppointments();
}


async function autoCloseOwnOverdueAppointments(){

  const today = empTodayDateString(0);
  const nowTime = new Date().toTimeString().slice(0, 8);

  await supabaseClient
    .from("appointments")
    .update({status: "completed", auto_closed: true})
    .eq("employee_id", employeeId)
    .eq("status", "booked")
    .lt("date", today);

  await supabaseClient
    .from("appointments")
    .update({status: "completed", auto_closed: true})
    .eq("employee_id", employeeId)
    .eq("status", "booked")
    .eq("date", today)
    .lt("end_time", nowTime);
}


async function loadEmployeeAppointments(){

  const container = document.getElementById("appointmentsListContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  await autoCloseOwnOverdueAppointments();

  let fromDate, toDate;

  if(currentFilter === "today"){
    fromDate = empTodayDateString(0);
    toDate = fromDate;
  }else if(currentFilter === "tomorrow"){
    fromDate = empTodayDateString(1);
    toDate = fromDate;
  }else{
    fromDate = empTodayDateString(0);
    toDate = empTodayDateString(6);
  }

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("id, service_id, date, start_time, end_time, status, booked_for_name, booked_for_phone, booking_group_id")
    .eq("employee_id", employeeId)
    .gte("date", fromDate)
    .lte("date", toDate)
    .neq("status", "cancelled")
    .order("date", {ascending: true})
    .order("start_time", {ascending: true});

  if(error){
    container.innerHTML = `<p>Не удалось загрузить записи: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p>Записей за выбранный период нет.</p>`;
    return;
  }

  const serviceIds = [...new Set(data.map(a => a.service_id).filter(Boolean))];
  let servicesById = {};

  if(serviceIds.length > 0){
    const {data: serviceRows} = await supabaseClient
      .from("services")
      .select("id, name")
      .in("id", serviceIds);

    (serviceRows || []).forEach(s => { servicesById[s.id] = s; });
  }

  data.forEach(a => { a.service_name = servicesById[a.service_id] ? servicesById[a.service_id].name : "Услуга"; });

  const visits = groupEmployeeAppointmentsByVisit(data);

  container.innerHTML = "";

  const today = empTodayDateString(0);

  visits.forEach((visit, index) => {

    const card = document.createElement("div");
    card.className = "card";
    if(index > 0){
      card.style.marginTop = "20px";
    }

    const servicesText = visit.rows.map(r => r.service_name).join(", ");

    card.innerHTML = `
      <h2>${empFormatDate(visit.date)} — ${empFormatTime(visit.start_time)}</h2>

      <p><strong>Клиент:</strong><br>${visit.booked_for_name}</p>

      ${visit.booked_for_phone ? `<p><strong>Телефон:</strong><br>${visit.booked_for_phone}</p>` : ""}

      <p><strong>Услуги:</strong><br>${servicesText}</p>

      <p><strong>Статус:</strong><br>${EMP_STATUS_LABELS[visit.status] || visit.status}</p>
    `;

    if(visit.status === "booked" && visit.date <= today){

      const completeBtn = document.createElement("button");
      completeBtn.className = "btn";
      completeBtn.type = "button";
      completeBtn.textContent = "Завершить";
      completeBtn.style.marginTop = "10px";
      completeBtn.addEventListener("click", () => updateAppointmentStatus(visit.ids, "completed"));

      const noShowBtn = document.createElement("button");
      noShowBtn.className = "btn btn-danger";
      noShowBtn.type = "button";
      noShowBtn.textContent = "Клиент не пришёл";
      noShowBtn.style.marginTop = "10px";
      noShowBtn.style.marginLeft = "10px";
      noShowBtn.addEventListener("click", () => updateAppointmentStatus(visit.ids, "no_show"));

      card.appendChild(completeBtn);
      card.appendChild(noShowBtn);
    }

    container.appendChild(card);
  });
}


// Группирует строки одного визита (несколько услуг, записанных
// вместе через booking_group_id) для отображения одной карточкой.
function groupEmployeeAppointmentsByVisit(rows){

  const groups = {};

  rows.forEach(row => {

    const key = row.booking_group_id || `single-${row.id}`;

    if(!groups[key]){
      groups[key] = {
        ids: [row.id],
        rows: [row],
        date: row.date,
        start_time: row.start_time,
        end_time: row.end_time,
        status: row.status,
        booked_for_name: row.booked_for_name,
        booked_for_phone: row.booked_for_phone
      };
      return;
    }

    const g = groups[key];
    g.ids.push(row.id);
    g.rows.push(row);
    if(row.start_time < g.start_time) g.start_time = row.start_time;
    if(row.end_time > g.end_time) g.end_time = row.end_time;
  });

  return Object.values(groups).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}


async function updateAppointmentStatus(appointmentIds, newStatus){

  const {error} = await supabaseClient
    .from("appointments")
    .update({status: newStatus})
    .in("id", appointmentIds)
    .eq("employee_id", employeeId);

  if(error){
    showToast("Не удалось обновить статус: " + error.message, "error");
    return;
  }

  showToast(newStatus === "completed" ? "Сеанс отмечен как завершённый" : "Отмечено: клиент не пришёл", "success");
  await loadEmployeeAppointments();
}


// ---------- Поиск клиентов ----------

async function initEmployeeClients(){

  const profile = await getProfile();

  if(!profile || (profile.role !== "employee" && profile.role !== "admin")){
    showToast("Доступ только для сотрудников", "error");
    window.location.href = "../login.html";
    return;
  }

  document.getElementById("clientSearchBtn").addEventListener("click", searchClients);
  document.getElementById("clientSearchInput").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      searchClients();
    }
  });
}


async function searchClients(){

  const query = document.getElementById("clientSearchInput").value.trim();
  const resultsContainer = document.getElementById("clientResultsContainer");
  const detailsContainer = document.getElementById("clientDetailsContainer");

  detailsContainer.innerHTML = "";

  if(!query){
    resultsContainer.innerHTML = "";
    return;
  }

  resultsContainer.innerHTML = `<p>Поиск...</p>`;

  const {data, error} = await supabaseClient
    .from("profiles")
    .select("id, first_name, last_name, phone, birth_date")
    .eq("role", "client")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(20);

  if(error){
    resultsContainer.innerHTML = `<p>Ошибка поиска: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    resultsContainer.innerHTML = `<p>Клиенты не найдены.</p>`;
    return;
  }

  resultsContainer.innerHTML = "";

  data.forEach(client => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.style.marginRight = "10px";
    btn.style.marginTop = "10px";
    btn.textContent = `${client.last_name} ${client.first_name}`;
    btn.addEventListener("click", () => showClientDetails(client));
    resultsContainer.appendChild(btn);
  });
}


async function showClientDetails(client){

  const container = document.getElementById("clientDetailsContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data: clientProfile} = await supabaseClient
    .from("client_profiles")
    .select("contraindications, notes")
    .eq("user_id", client.id)
    .maybeSingle();

  const {data: history} = await supabaseClient
    .from("appointments")
    .select("date, service_id, status")
    .eq("client_id", client.id)
    .eq("status", "completed")
    .order("date", {ascending: false})
    .limit(10);

  const serviceIds = [...new Set((history || []).map(h => h.service_id).filter(Boolean))];
  let servicesById = {};

  if(serviceIds.length > 0){
    const {data: serviceRows} = await supabaseClient
      .from("services")
      .select("id, name")
      .in("id", serviceIds);

    (serviceRows || []).forEach(s => { servicesById[s.id] = s; });
  }

  const birthDateText = client.birth_date
    ? client.birth_date.split("-").reverse().join(".")
    : "Не указано";

  const historyHtml = (history && history.length > 0)
    ? history.map(h => `<p>${empFormatDate(h.date)} — ${servicesById[h.service_id] ? servicesById[h.service_id].name : "Услуга"}</p>`).join("")
    : "<p>Посещений пока не было.</p>";

  currentNoteClientId = client.id;

  const {data: notes} = await supabaseClient
    .from("employee_notes")
    .select("id, note, created_at, employee_id")
    .eq("client_id", client.id)
    .order("created_at", {ascending: false});

  const employeeIds = [...new Set((notes || []).map(n => n.employee_id).filter(Boolean))];
  let employeeNamesById = {};

  if(employeeIds.length > 0){
    const {data: employeeProfiles} = await supabaseClient
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", employeeIds);

    (employeeProfiles || []).forEach(p => { employeeNamesById[p.id] = `${p.first_name} ${p.last_name}`; });
  }

  const notesHtml = (notes && notes.length > 0)
    ? notes.map(n => `
        <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid #eee;">
          <p>${n.note}</p>
          <p style="opacity:0.7; font-size:14px;">
            ${employeeNamesById[n.employee_id] || "Сотрудник"} — ${new Date(n.created_at).toLocaleDateString("ru-RU")}
          </p>
        </div>
      `).join("")
    : "<p>Заметок пока нет.</p>";

  container.innerHTML = `
    <div class="card" style="margin-top:20px;">
      <h2>${client.last_name} ${client.first_name}</h2>
      <p><strong>Телефон:</strong><br>${client.phone || "Не указано"}</p>
      <p><strong>Дата рождения:</strong><br>${birthDateText}</p>
    </div>

    <div class="card" style="margin-top:20px;">
      <h2>Записать на приём</h2>

      <form onsubmit="return false;">
        <label>Услуга</label>
        <select id="staffBookingService">
          <option>Загрузка...</option>
        </select>

        <label style="margin-top:10px;">Дата</label>
        <input type="date" id="staffBookingDate">
      </form>

      <p id="staffBookingMasterInfo" class="booking-message" style="display:none; margin-top:10px;"></p>

      <div id="staffBookingSlots" class="slots-container" style="margin-top:10px;">
        <p>Выберите услугу и дату</p>
      </div>

      <p id="staffBookingMessage" class="booking-message" style="display:none;"></p>

      <button class="btn" type="button" id="staffBookingSubmitBtn" style="margin-top:15px;">
      Записать
      </button>
    </div>

    <div class="card" style="margin-top:20px;">
      <h2>Медицинская информация</h2>
      <h3>Противопоказания, операции, травмы, аллергии</h3>
      <p>${(clientProfile && clientProfile.contraindications) ? clientProfile.contraindications : "Данные не заполнены."}</p>
      <h3 style="margin-top:15px;">Заметки клиента</h3>
      <p>${(clientProfile && clientProfile.notes) ? clientProfile.notes : "Нет данных."}</p>
    </div>

    <div class="card" style="margin-top:20px;">
      <h2>История посещений</h2>
      ${historyHtml}
    </div>

    <div class="card" style="margin-top:20px;">
      <h2>Внутренняя заметка</h2>
      <p>Видят только сотрудники и администрация.</p>

      ${notesHtml}

      <form onsubmit="return false;">
        <textarea id="newNoteText" rows="4" placeholder="Добавить заметку" style="margin-top:10px;"></textarea>
      </form>

      <button class="btn" type="button" id="saveNoteBtn" style="margin-top:15px;">
      Сохранить
      </button>
    </div>
  `;

  document.getElementById("saveNoteBtn").addEventListener("click", saveClientNote);

  await initStaffBooking(client);
}


async function saveClientNote(){

  const text = document.getElementById("newNoteText").value.trim();

  if(!text){
    showToast("Напишите текст заметки", "error");
    return;
  }

  if(!currentNoteClientId){
    return;
  }

  const btn = document.getElementById("saveNoteBtn");
  btn.disabled = true;
  btn.textContent = "Сохраняем...";

  const {error} = await supabaseClient
    .from("employee_notes")
    .insert({
      client_id: currentNoteClientId,
      employee_id: employeeId,
      note: text
    });

  btn.disabled = false;
  btn.textContent = "Сохранить";

  if(error){
    showToast("Не удалось сохранить заметку: " + error.message, "error");
    return;
  }

  showToast("Заметка сохранена", "success");

  const {data: clientRow} = await supabaseClient
    .from("profiles")
    .select("id, first_name, last_name, phone, birth_date")
    .eq("id", currentNoteClientId)
    .single();

  if(clientRow){
    await showClientDetails(clientRow);
  }
}


// ---------- Общая лента заметок (employee/comments.html) ----------

let selectedNoteClient = null;


async function initEmployeeComments(){

  const profile = await getProfile();

  if(!profile || (profile.role !== "employee" && profile.role !== "admin")){
    showToast("Доступ только для сотрудников", "error");
    window.location.href = "../login.html";
    return;
  }

  const {data: {user}} = await supabaseClient.auth.getUser();
  employeeId = user.id;

  document.getElementById("commentClientSearchBtn").addEventListener("click", searchClientForComment);
  document.getElementById("commentClientSearchInput").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      searchClientForComment();
    }
  });

  document.getElementById("saveCommentBtn").addEventListener("click", saveCommentNote);

  await loadCommentsFeed();
}


async function searchClientForComment(){

  const query = document.getElementById("commentClientSearchInput").value.trim();
  const resultsContainer = document.getElementById("commentClientResults");

  selectedNoteClient = null;
  document.getElementById("commentFormBox").style.display = "none";

  if(!query){
    resultsContainer.innerHTML = "";
    return;
  }

  const {data, error} = await supabaseClient
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("role", "client")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(20);

  if(error){
    resultsContainer.innerHTML = `<p>Ошибка поиска: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    resultsContainer.innerHTML = `<p>Клиенты не найдены.</p>`;
    return;
  }

  resultsContainer.innerHTML = "";

  data.forEach(client => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.style.marginRight = "10px";
    btn.style.marginTop = "10px";
    btn.textContent = `${client.last_name} ${client.first_name}`;
    btn.addEventListener("click", () => {
      selectedNoteClient = client;
      document.getElementById("commentFormBox").style.display = "block";
      document.getElementById("commentFormClientName").textContent = `${client.last_name} ${client.first_name}`;
    });
    resultsContainer.appendChild(btn);
  });
}


async function saveCommentNote(){

  if(!selectedNoteClient){
    showToast("Сначала выберите клиента", "error");
    return;
  }

  const text = document.getElementById("commentText").value.trim();

  if(!text){
    showToast("Напишите текст комментария", "error");
    return;
  }

  const btn = document.getElementById("saveCommentBtn");
  btn.disabled = true;
  btn.textContent = "Сохраняем...";

  const {error} = await supabaseClient
    .from("employee_notes")
    .insert({
      client_id: selectedNoteClient.id,
      employee_id: employeeId,
      note: text
    });

  btn.disabled = false;
  btn.textContent = "Сохранить";

  if(error){
    showToast("Не удалось сохранить комментарий: " + error.message, "error");
    return;
  }

  showToast("Комментарий сохранён", "success");
  document.getElementById("commentText").value = "";
  document.getElementById("commentFormBox").style.display = "none";
  selectedNoteClient = null;
  document.getElementById("commentClientResults").innerHTML = "";
  document.getElementById("commentClientSearchInput").value = "";

  await loadCommentsFeed();
}


async function loadCommentsFeed(){

  const container = document.getElementById("commentsFeedContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data: notes, error} = await supabaseClient
    .from("employee_notes")
    .select("id, note, created_at, client_id, employee_id")
    .order("created_at", {ascending: false})
    .limit(30);

  if(error){
    container.innerHTML = `<p>Не удалось загрузить комментарии: ${error.message}</p>`;
    return;
  }

  if(!notes || notes.length === 0){
    container.innerHTML = `<p>Комментариев пока нет.</p>`;
    return;
  }

  const peopleIds = [...new Set([
    ...notes.map(n => n.client_id),
    ...notes.map(n => n.employee_id)
  ].filter(Boolean))];

  let namesById = {};

  if(peopleIds.length > 0){
    const {data: peopleRows} = await supabaseClient
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", peopleIds);

    (peopleRows || []).forEach(p => { namesById[p.id] = `${p.last_name} ${p.first_name}`; });
  }

  container.innerHTML = "";

  notes.forEach((note, index) => {
    const card = document.createElement("div");
    card.className = "card";
    if(index > 0){
      card.style.marginTop = "20px";
    }

    card.innerHTML = `
      <h2>${namesById[note.client_id] || "Клиент"}</h2>
      <p><strong>Комментарий:</strong></p>
      <p>${note.note}</p>
      <p style="opacity:0.7; font-size:14px; margin-top:10px;">
        Добавил: ${namesById[note.employee_id] || "Сотрудник"} — ${new Date(note.created_at).toLocaleDateString("ru-RU")}
      </p>
    `;

    container.appendChild(card);
  });
}


// ---------- Предпросмотр предстоящих записей (employee/dashboard.html) ----------

async function loadUpcomingAppointmentsPreview(){

  const container = document.getElementById("upcomingAppointmentsPreview");
  if(!container) return;

  const {data: {user}} = await supabaseClient.auth.getUser();

  if(!user){
    return;
  }

  const today = empTodayDateString(0);

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("id, service_id, date, start_time, status, booked_for_name")
    .eq("employee_id", user.id)
    .gte("date", today)
    .neq("status", "cancelled")
    .order("date", {ascending: true})
    .order("start_time", {ascending: true})
    .limit(5);

  if(error){
    container.innerHTML = `<p>Не удалось загрузить записи: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p>Предстоящих записей нет.</p>`;
    return;
  }

  const serviceIds = [...new Set(data.map(a => a.service_id).filter(Boolean))];
  let servicesById = {};

  if(serviceIds.length > 0){
    const {data: serviceRows} = await supabaseClient.from("services").select("id, name").in("id", serviceIds);
    (serviceRows || []).forEach(s => { servicesById[s.id] = s; });
  }

  container.innerHTML = "";

  data.forEach(a => {
    const row = document.createElement("p");
    const serviceName = servicesById[a.service_id] ? servicesById[a.service_id].name : "Услуга";
    row.innerHTML = `<strong>${empFormatDate(a.date)}, ${empFormatTime(a.start_time)}</strong> — ${a.booked_for_name} (${serviceName})`;
    container.appendChild(row);
  });
}


// =====================================
// Запись клиента на приём сотрудником/админом
// =====================================

let staffBookingServicesCache = [];
let staffBookingSelectedTime = null;
let staffBookingAssignedEmployeeId = null;

function staffBookingTodayDateString(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function staffTimeToMinutes(timeStr){
  const parts = timeStr.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function staffMinutesToTimeString(totalMinutes){
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00";
}

function staffMinutesToDisplay(totalMinutes){
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function staffBookingShowMessage(text, isError){
  const box = document.getElementById("staffBookingMessage");
  if(!box) return;
  box.textContent = text;
  box.style.display = text ? "block" : "none";
  box.style.color = isError ? "#b02a2a" : "#173f35";
}

function staffBookingShowMasterInfo(text){
  const box = document.getElementById("staffBookingMasterInfo");
  if(!box) return;
  box.textContent = text;
  box.style.display = text ? "block" : "none";
}


async function initStaffBooking(client){

  const dateInput = document.getElementById("staffBookingDate");
  if(!dateInput) return;

  dateInput.min = staffBookingTodayDateString();
  dateInput.value = staffBookingTodayDateString();

  if(staffBookingServicesCache.length === 0){
    const {data} = await supabaseClient
      .from("services")
      .select("id, name, duration_minutes, price")
      .eq("is_active", true)
      .order("name");
    staffBookingServicesCache = data || [];
  }

  const select = document.getElementById("staffBookingService");
  select.innerHTML = "";
  staffBookingServicesCache.forEach(s => {
    const option = document.createElement("option");
    option.value = s.id;
    option.textContent = `${s.name} — ${s.duration_minutes} мин, ${s.price} ₽`;
    select.appendChild(option);
  });

  select.addEventListener("change", () => refreshStaffSlots(client));
  dateInput.addEventListener("change", () => refreshStaffSlots(client));

  document.getElementById("staffBookingSubmitBtn").addEventListener("click", () => submitStaffBooking(client));

  await refreshStaffSlots(client);
}


function staffOverlaps(startA, endA, startB, endB){
  return startA < endB && endA > startB;
}


async function refreshStaffSlots(client){

  staffBookingSelectedTime = null;
  staffBookingAssignedEmployeeId = null;

  const container = document.getElementById("staffBookingSlots");
  container.innerHTML = "";
  staffBookingShowMessage("", false);
  staffBookingShowMasterInfo("");

  const serviceId = document.getElementById("staffBookingService").value;
  const date = document.getElementById("staffBookingDate").value;

  if(!serviceId || !date){
    return;
  }

  const service = staffBookingServicesCache.find(s => String(s.id) === String(serviceId));
  if(!service){
    return;
  }

  container.innerHTML = `<p>Загрузка...</p>`;

  const {data: holidayRows} = await supabaseClient
    .from("holidays")
    .select("id, reason")
    .eq("date", date);

  if(holidayRows && holidayRows.length > 0){
    container.innerHTML = "";
    staffBookingShowMessage("В этот день салон не работает" + (holidayRows[0].reason ? ` (${holidayRows[0].reason})` : ""), true);
    return;
  }

  const salonSettings = await fetchSalonSettings();
  const workDays = (salonSettings.work_days || "1,2,3,4,5,6").split(",").map(n => parseInt(n, 10));
  const [y, m, d] = date.split("-").map(n => parseInt(n, 10));
  const jsDay = new Date(y, m - 1, d).getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;

  if(!workDays.includes(isoDay)){
    container.innerHTML = "";
    staffBookingShowMessage("В этот день недели салон не работает.", true);
    return;
  }

  const {data: scheduleRow} = await supabaseClient
    .from("employee_schedule")
    .select("employee_id, start_time, end_time")
    .eq("date", date)
    .maybeSingle();

  if(!scheduleRow){
    container.innerHTML = "";
    staffBookingShowMessage("На эту дату мастер не назначен администратором.", true);
    return;
  }

  const {data: masterProfile} = await supabaseClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", scheduleRow.employee_id)
    .maybeSingle();

  staffBookingAssignedEmployeeId = scheduleRow.employee_id;
  staffBookingShowMasterInfo(`Мастер дня: ${masterProfile ? masterProfile.first_name + " " + masterProfile.last_name : "—"}`);

  const {data: busyRows, error: busyError} = await supabaseClient
    .from("appointments")
    .select("start_time, end_time")
    .eq("employee_id", scheduleRow.employee_id)
    .eq("date", date)
    .neq("status", "cancelled");

  if(busyError){
    container.innerHTML = "";
    staffBookingShowMessage("Не удалось проверить занятость: " + busyError.message, true);
    return;
  }

  const busy = (busyRows || []).map(r => ({
    start: staffTimeToMinutes(r.start_time),
    end: staffTimeToMinutes(r.end_time)
  }));

  const duration = service.duration_minutes;
  const today = staffBookingTodayDateString();
  const isToday = date === today;
  const nowMinutes = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : -1;

  const salonWorkStart = staffTimeToMinutes(salonSettings.work_start || "10:00:00");
  const salonWorkEnd = staffTimeToMinutes(salonSettings.work_end || "20:00:00");

  const windowStart = Math.max(staffTimeToMinutes(scheduleRow.start_time), salonWorkStart);
  const windowEnd = Math.min(staffTimeToMinutes(scheduleRow.end_time), salonWorkEnd);

  const slots = [];

  for(let start = windowStart; start + duration <= windowEnd; start += 30){
    const end = start + duration;
    if(isToday && start <= nowMinutes){
      continue;
    }
    if(busy.some(b => staffOverlaps(start, end, b.start, b.end))){
      continue;
    }
    slots.push(start);
  }

  container.innerHTML = "";

  if(slots.length === 0){
    staffBookingShowMessage("Нет свободных слотов на выбранную дату.", true);
    return;
  }

  slots.forEach(startMinutes => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.textContent = staffMinutesToDisplay(startMinutes);
    btn.addEventListener("click", () => {
      staffBookingSelectedTime = startMinutes;
      container.querySelectorAll(".slot-btn").forEach(b => b.classList.remove("slot-btn-active"));
      btn.classList.add("slot-btn-active");
    });
    container.appendChild(btn);
  });
}


async function submitStaffBooking(client){

  const serviceId = document.getElementById("staffBookingService").value;
  const date = document.getElementById("staffBookingDate").value;

  if(!serviceId || !date || !staffBookingAssignedEmployeeId){
    staffBookingShowMessage("Выберите услугу, дату и мастера", true);
    return;
  }

  if(staffBookingSelectedTime === null){
    staffBookingShowMessage("Выберите время", true);
    return;
  }

  const service = staffBookingServicesCache.find(s => String(s.id) === String(serviceId));
  const startTimeStr = staffMinutesToTimeString(staffBookingSelectedTime);
  const endTimeStr = staffMinutesToTimeString(staffBookingSelectedTime + service.duration_minutes);

  const btn = document.getElementById("staffBookingSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Записываем...";

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {error} = await supabaseClient
    .from("appointments")
    .insert({
      client_id: client.id,
      booked_for_name: `${client.last_name} ${client.first_name}`,
      booked_for_phone: client.phone || null,
      service_id: serviceId,
      employee_id: staffBookingAssignedEmployeeId,
      date: date,
      start_time: startTimeStr,
      end_time: endTimeStr,
      status: "booked",
      created_by: user.id,
      final_price: service.price
    });

  btn.disabled = false;
  btn.textContent = "Записать";

  if(error){
    if(error.code === "23P01"){
      staffBookingShowMessage("Это время уже занято. Выберите другое.", true);
      await refreshStaffSlots(client);
      return;
    }
    staffBookingShowMessage("Не удалось создать запись: " + error.message, true);
    return;
  }

  showToast("Клиент записан на приём", "success");
  await refreshStaffSlots(client);
}
