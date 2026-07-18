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
    .select("id, service_id, date, start_time, end_time, status, booked_for_name, booked_for_phone")
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

  container.innerHTML = "";

  const today = empTodayDateString(0);

  data.forEach((appointment, index) => {

    const card = document.createElement("div");
    card.className = "card";
    if(index > 0){
      card.style.marginTop = "20px";
    }

    const serviceName = servicesById[appointment.service_id] ? servicesById[appointment.service_id].name : "Услуга";

    card.innerHTML = `
      <h2>${empFormatDate(appointment.date)} — ${empFormatTime(appointment.start_time)}</h2>

      <p><strong>Клиент:</strong><br>${appointment.booked_for_name}</p>

      ${appointment.booked_for_phone ? `<p><strong>Телефон:</strong><br>${appointment.booked_for_phone}</p>` : ""}

      <p><strong>Услуга:</strong><br>${serviceName}</p>

      <p><strong>Статус:</strong><br>${EMP_STATUS_LABELS[appointment.status] || appointment.status}</p>
    `;

    if(appointment.status === "booked" && appointment.date <= today){

      const completeBtn = document.createElement("button");
      completeBtn.className = "btn";
      completeBtn.type = "button";
      completeBtn.textContent = "Завершить";
      completeBtn.style.marginTop = "10px";
      completeBtn.addEventListener("click", () => updateAppointmentStatus(appointment.id, "completed"));

      const noShowBtn = document.createElement("button");
      noShowBtn.className = "btn btn-danger";
      noShowBtn.type = "button";
      noShowBtn.textContent = "Клиент не пришёл";
      noShowBtn.style.marginTop = "10px";
      noShowBtn.style.marginLeft = "10px";
      noShowBtn.addEventListener("click", () => updateAppointmentStatus(appointment.id, "no_show"));

      card.appendChild(completeBtn);
      card.appendChild(noShowBtn);
    }

    container.appendChild(card);
  });
}


async function updateAppointmentStatus(appointmentId, newStatus){

  const {error} = await supabaseClient
    .from("appointments")
    .update({status: newStatus})
    .eq("id", appointmentId)
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
