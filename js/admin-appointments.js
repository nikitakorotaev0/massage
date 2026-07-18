// =====================================
// Админ: все записи (просмотр, отмена, авто-закрытие просроченных)
// =====================================

let adminApptFilter = "today";

const ADMIN_APPT_STATUS_LABELS = {
  booked: "Ожидает посещения",
  completed: "Завершено",
  cancelled: "Отменено",
  no_show: "Не пришёл"
};


function adminApptTodayDateString(offset){
  const d = new Date();
  d.setDate(d.getDate() + (offset || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const ADMIN_APPT_MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

function adminApptFormatDate(dateStr){
  const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
  return `${d} ${ADMIN_APPT_MONTHS_RU[m - 1]} ${y}`;
}


// Записи, которые прошли по времени, но сотрудник так и не отметил
// их завершёнными или неявкой — автоматически переводим в "завершено",
// но помечаем auto_closed, чтобы админ видел, что это не подтверждено сотрудником.
async function autoCloseOverdueAppointments(){

  const today = adminApptTodayDateString(0);
  const nowTime = new Date().toTimeString().slice(0, 8);

  await supabaseClient
    .from("appointments")
    .update({status: "completed", auto_closed: true})
    .eq("status", "booked")
    .lt("date", today);

  await supabaseClient
    .from("appointments")
    .update({status: "completed", auto_closed: true})
    .eq("status", "booked")
    .eq("date", today)
    .lt("end_time", nowTime);
}


async function initAdminAppointments(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  document.getElementById("apptFilterToday").addEventListener("click", () => setAdminApptFilter("today"));
  document.getElementById("apptFilterTomorrow").addEventListener("click", () => setAdminApptFilter("tomorrow"));
  document.getElementById("apptFilterWeek").addEventListener("click", () => setAdminApptFilter("week"));
  document.getElementById("apptFilterAll").addEventListener("click", () => setAdminApptFilter("all"));

  await autoCloseOverdueAppointments();
  await setAdminApptFilter("today");
}


function setAdminApptFilter(filter){

  adminApptFilter = filter;

  ["apptFilterToday", "apptFilterTomorrow", "apptFilterWeek", "apptFilterAll"].forEach(id => {
    document.getElementById(id).classList.remove("btn-active-filter");
  });

  const activeId = {
    today: "apptFilterToday",
    tomorrow: "apptFilterTomorrow",
    week: "apptFilterWeek",
    all: "apptFilterAll"
  }[filter];

  document.getElementById(activeId).classList.add("btn-active-filter");

  return loadAdminAppointments();
}


async function loadAdminAppointments(){

  const container = document.getElementById("adminAppointmentsContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  let query = supabaseClient
    .from("appointments")
    .select("id, service_id, employee_id, date, start_time, end_time, status, booked_for_name, booked_for_phone, auto_closed, booking_group_id")
    .neq("status", "cancelled")
    .order("date", {ascending: true})
    .order("start_time", {ascending: true});

  if(adminApptFilter === "today"){
    const d = adminApptTodayDateString(0);
    query = query.eq("date", d);
  }else if(adminApptFilter === "tomorrow"){
    const d = adminApptTodayDateString(1);
    query = query.eq("date", d);
  }else if(adminApptFilter === "week"){
    query = query.gte("date", adminApptTodayDateString(0)).lte("date", adminApptTodayDateString(6));
  }
  // "all" — без ограничения по дате

  const {data, error} = await query;

  if(error){
    container.innerHTML = `<p>Не удалось загрузить записи: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p>Записей за выбранный период нет.</p>`;
    return;
  }

  const serviceIds = [...new Set(data.map(a => a.service_id).filter(Boolean))];
  const employeeIds = [...new Set(data.map(a => a.employee_id).filter(Boolean))];

  let servicesById = {};
  let profilesById = {};

  if(serviceIds.length > 0){
    const {data: serviceRows} = await supabaseClient.from("services").select("id, name").in("id", serviceIds);
    (serviceRows || []).forEach(s => { servicesById[s.id] = s; });
  }

  if(employeeIds.length > 0){
    const {data: profileRows} = await supabaseClient.from("profiles").select("id, first_name, last_name").in("id", employeeIds);
    (profileRows || []).forEach(p => { profilesById[p.id] = p; });
  }

  data.forEach(a => { a.service_name = servicesById[a.service_id] ? servicesById[a.service_id].name : "Услуга"; });

  const visits = groupAdminAppointmentsByVisit(data);

  container.innerHTML = "";

  visits.forEach((visit, index) => {

    const card = document.createElement("div");
    card.className = "card";
    if(visit.auto_closed){
      card.classList.add("danger-zone");
    }
    if(index > 0){
      card.style.marginTop = "20px";
    }

    const servicesText = visit.rows.map(r => r.service_name).join(", ");
    const employeeName = profilesById[visit.employee_id] ? `${profilesById[visit.employee_id].first_name} ${profilesById[visit.employee_id].last_name}` : "—";

    card.innerHTML = `
      <h2>${adminApptFormatDate(visit.date)} — ${visit.start_time.slice(0,5)}</h2>

      <p><strong>Клиент:</strong><br>${visit.booked_for_name}</p>

      ${visit.booked_for_phone ? `<p><strong>Телефон:</strong><br>${visit.booked_for_phone}</p>` : ""}

      <p><strong>Услуги:</strong><br>${servicesText}</p>

      <p><strong>Мастер:</strong><br>${employeeName}</p>

      <p><strong>Статус:</strong><br>${ADMIN_APPT_STATUS_LABELS[visit.status] || visit.status}</p>

      ${visit.auto_closed ? `<p><strong>⚠ Не подтверждено сотрудником</strong><br>Запись закрылась автоматически по истечении времени.</p>` : ""}
    `;

    if(visit.status === "booked"){
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-danger";
      cancelBtn.type = "button";
      cancelBtn.style.marginTop = "10px";
      cancelBtn.textContent = "Отменить запись";
      cancelBtn.addEventListener("click", () => cancelAppointmentAsAdmin(visit.ids));
      card.appendChild(cancelBtn);
    }

    container.appendChild(card);
  });
}


// Группирует строки одного визита (несколько услуг через booking_group_id)
function groupAdminAppointmentsByVisit(rows){

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
        booked_for_phone: row.booked_for_phone,
        employee_id: row.employee_id,
        auto_closed: !!row.auto_closed
      };
      return;
    }

    const g = groups[key];
    g.ids.push(row.id);
    g.rows.push(row);
    if(row.start_time < g.start_time) g.start_time = row.start_time;
    if(row.end_time > g.end_time) g.end_time = row.end_time;
    if(row.auto_closed) g.auto_closed = true;
  });

  return Object.values(groups).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}


async function cancelAppointmentAsAdmin(appointmentIds){

  const confirmed = await showConfirm("Отменить эту запись?");
  if(!confirmed){
    return;
  }

  const {error} = await supabaseClient
    .from("appointments")
    .update({status: "cancelled"})
    .in("id", appointmentIds);

  if(error){
    showToast("Не удалось отменить запись: " + error.message, "error");
    return;
  }

  showToast("Запись отменена", "success");
  await loadAdminAppointments();
}
