// =====================================
// Админ: расписание сотрудников (кто из мастеров работает в какой день)
// и статистика по фактически отработанным сменам
// =====================================

const SCHEDULE_DAYS_AHEAD = 34;
const DEFAULT_SHIFT_START = "10:00:00";
const DEFAULT_SHIFT_END = "20:00:00";

let scheduleEmployeesCache = [];
let scheduleRowsByDate = {};


function scheduleDateString(offsetDays){
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const SCHEDULE_MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

const SCHEDULE_WEEKDAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function scheduleFormatDate(dateStr){
  const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
  const dateObj = new Date(y, m - 1, d);
  const weekday = SCHEDULE_WEEKDAYS_RU[dateObj.getDay()];
  return `${d} ${SCHEDULE_MONTHS_RU[m - 1]}, ${weekday}`;
}


async function initAdminSchedule(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  await loadScheduleEmployees();
  await loadSchedule();
  await loadShiftStats();

  document.getElementById("assignBtn").addEventListener("click", assignFromForm);

  const dateInput = document.getElementById("assignDate");
  dateInput.min = scheduleDateString(0);
  dateInput.value = scheduleDateString(0);
}


async function loadScheduleEmployees(){

  const {data: employeeRows, error} = await supabaseClient
    .from("employees")
    .select("user_id, position, is_active")
    .eq("is_active", true);

  if(error){
    showToast("Не удалось загрузить сотрудников: " + error.message, "error");
    return;
  }

  const userIds = (employeeRows || []).map(r => r.user_id);
  let profilesById = {};

  if(userIds.length > 0){
    const {data: profileRows} = await supabaseClient
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", userIds);

    (profileRows || []).forEach(p => { profilesById[p.id] = p; });
  }

  scheduleEmployeesCache = (employeeRows || []).map(row => ({
    user_id: row.user_id,
    position: row.position,
    first_name: profilesById[row.user_id] ? profilesById[row.user_id].first_name : "",
    last_name: profilesById[row.user_id] ? profilesById[row.user_id].last_name : ""
  }));

  const select = document.getElementById("assignEmployee");
  select.innerHTML = "";

  if(scheduleEmployeesCache.length === 0){
    select.innerHTML = `<option value="">Нет сотрудников</option>`;
    return;
  }

  scheduleEmployeesCache.forEach(emp => {
    const option = document.createElement("option");
    option.value = emp.user_id;
    const positionText = emp.position ? ` (${emp.position})` : "";
    option.textContent = `${emp.last_name} ${emp.first_name}${positionText}`;
    select.appendChild(option);
  });
}


function employeeNameById(id){
  const emp = scheduleEmployeesCache.find(e => e.user_id === id);
  return emp ? `${emp.last_name} ${emp.first_name}` : "Сотрудник";
}


async function loadSchedule(){

  const container = document.getElementById("scheduleContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const fromDate = scheduleDateString(0);
  const toDate = scheduleDateString(SCHEDULE_DAYS_AHEAD);

  const {data, error} = await supabaseClient
    .from("employee_schedule")
    .select("id, employee_id, date, start_time, end_time")
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", {ascending: true});

  if(error){
    container.innerHTML = `<p>Не удалось загрузить расписание: ${error.message}</p>`;
    return;
  }

  scheduleRowsByDate = {};
  (data || []).forEach(row => { scheduleRowsByDate[row.date] = row; });

  container.innerHTML = "";

  for(let offset = 0; offset <= SCHEDULE_DAYS_AHEAD; offset++){

    const date = scheduleDateString(offset);
    const row = scheduleRowsByDate[date];

    const dayCard = document.createElement("div");
    dayCard.className = "card schedule-day";
    if(offset > 0){
      dayCard.style.marginTop = "10px";
    }

    const assignedText = row
      ? `${employeeNameById(row.employee_id)} (${row.start_time.slice(0,5)}–${row.end_time.slice(0,5)})`
      : "Не назначен";

    dayCard.innerHTML = `
      <div class="schedule-day-row">
        <div>
          <strong>${scheduleFormatDate(date)}</strong><br>
          ${assignedText}
        </div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "schedule-day-actions";

    const quickSelect = document.createElement("select");
    scheduleEmployeesCache.forEach(emp => {
      const option = document.createElement("option");
      option.value = emp.user_id;
      option.textContent = `${emp.last_name} ${emp.first_name}`;
      if(row && row.employee_id === emp.user_id){
        option.selected = true;
      }
      quickSelect.appendChild(option);
    });

    const setBtn = document.createElement("button");
    setBtn.className = "btn";
    setBtn.type = "button";
    setBtn.textContent = row ? "Заменить" : "Назначить";
    setBtn.addEventListener("click", () => assignEmployeeToDate(date, quickSelect.value));

    actions.appendChild(quickSelect);
    actions.appendChild(setBtn);

    if(row){
      const clearBtn = document.createElement("button");
      clearBtn.className = "btn btn-danger";
      clearBtn.type = "button";
      clearBtn.textContent = "Убрать";
      clearBtn.addEventListener("click", () => unassignDate(date));
      actions.appendChild(clearBtn);
    }

    dayCard.appendChild(actions);
    container.appendChild(dayCard);
  }
}


async function assignFromForm(){
  const date = document.getElementById("assignDate").value;
  const employeeId = document.getElementById("assignEmployee").value;

  if(!date || !employeeId){
    showToast("Выберите дату и сотрудника", "error");
    return;
  }

  await assignEmployeeToDate(date, employeeId);
}


async function assignEmployeeToDate(date, employeeId){

  if(!employeeId){
    showToast("Выберите сотрудника", "error");
    return;
  }

  const {error} = await supabaseClient
    .from("employee_schedule")
    .upsert({
      date: date,
      employee_id: employeeId,
      start_time: DEFAULT_SHIFT_START,
      end_time: DEFAULT_SHIFT_END
    }, {onConflict: "date"});

  if(error){
    showToast("Не удалось назначить сотрудника: " + error.message, "error");
    return;
  }

  showToast(`Мастер на ${scheduleFormatDate(date)} назначен`, "success");
  await loadSchedule();
}


async function unassignDate(date){

  const confirmed = await showConfirm(`Убрать назначение мастера на ${scheduleFormatDate(date)}?`);
  if(!confirmed){
    return;
  }

  const {error} = await supabaseClient
    .from("employee_schedule")
    .delete()
    .eq("date", date);

  if(error){
    showToast("Не удалось убрать назначение: " + error.message, "error");
    return;
  }

  showToast("Назначение убрано", "success");
  await loadSchedule();
}


// ---------- Статистика по сменам ----------

async function loadShiftStats(){

  const container = document.getElementById("statsContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const {data, error} = await supabaseClient
    .from("employee_shifts")
    .select("employee_id, shift_start, shift_end")
    .gte("shift_start", monthStart);

  if(error){
    container.innerHTML = `<p>Не удалось загрузить статистику: ${error.message}</p>`;
    return;
  }

  const statsByEmployee = {};

  (data || []).forEach(shift => {

    if(!shift.shift_end){
      return;
    }

    const durationMs = new Date(shift.shift_end) - new Date(shift.shift_start);
    const durationHours = durationMs / (1000 * 60 * 60);

    if(!statsByEmployee[shift.employee_id]){
      statsByEmployee[shift.employee_id] = {hours: 0, shifts: 0};
    }

    statsByEmployee[shift.employee_id].hours += durationHours;
    statsByEmployee[shift.employee_id].shifts += 1;
  });

  container.innerHTML = "";

  const employeeIds = Object.keys(statsByEmployee);

  if(employeeIds.length === 0){
    container.innerHTML = `<p>В этом месяце завершённых смен пока нет.</p>`;
    return;
  }

  employeeIds.forEach(id => {
    const stat = statsByEmployee[id];
    const row = document.createElement("p");
    row.innerHTML = `<strong>${employeeNameById(id)}:</strong> ${stat.hours.toFixed(1)} ч, ${stat.shifts} смен(ы)`;
    container.appendChild(row);
  });
}
