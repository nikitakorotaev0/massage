// =====================================
// Логика страницы "Запись на массаж"
//
// Мастер дня определяется администратором заранее в расписании
// (admin/schedule.html, таблица employee_schedule — один сотрудник
// на весь день). Клиент его не выбирает, а видит того, кто назначен
// на выбранную дату. Если на дату никто не назначен — запись
// на этот день недоступна.
// =====================================

const SLOT_STEP_MINUTES = 30;

let currentProfile = null;
let servicesCache = [];
let selectedTime = null;
let assignedEmployeeId = null;


// ---------- Утилиты работы со временем ----------

function timeStringToMinutes(timeStr){
  // timeStr вида "10:00:00" или "10:00"
  const parts = timeStr.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function minutesToTimeString(totalMinutes){
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00";
}

function minutesToDisplay(totalMinutes){
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function todayDateString(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


// ---------- Сообщения на странице ----------

function showMessage(text, isError){
  const box = document.getElementById("bookingMessage");
  if(!box) return;
  box.textContent = text;
  box.style.display = text ? "block" : "none";
  box.style.color = isError ? "#b02a2a" : "#173f35";
}

function showMasterInfo(text){
  const box = document.getElementById("masterInfo");
  if(!box) return;
  box.textContent = text;
  box.style.display = text ? "block" : "none";
}


// ---------- Инициализация страницы ----------

async function initBooking(){

  currentProfile = await getProfile();

  if(!currentProfile){
    window.location.href = "../login.html";
    return;
  }

  const dateInput = document.getElementById("dateInput");
  dateInput.min = todayDateString();
  dateInput.value = todayDateString();

  document.getElementById("personSelf").addEventListener("change", toggleOtherPersonFields);
  document.getElementById("personOther").addEventListener("change", toggleOtherPersonFields);
  toggleOtherPersonFields();

  await loadServices();

  document.getElementById("serviceSelect").addEventListener("change", refreshSlots);
  dateInput.addEventListener("change", refreshSlots);

  document.getElementById("submitBookingBtn").addEventListener("click", submitBooking);

  await refreshSlots();
}


function toggleOtherPersonFields(){
  const isOther = document.getElementById("personOther").checked;
  document.getElementById("otherPersonFields").style.display = isOther ? "flex" : "none";
}


// ---------- Загрузка справочников ----------

async function loadServices(){

  const {data, error} = await supabaseClient
    .from("services")
    .select("id, name, description, duration_minutes, price")
    .eq("is_active", true)
    .order("name");

  if(error){
    showMessage("Не удалось загрузить список услуг: " + error.message, true);
    return;
  }

  servicesCache = data || [];

  const select = document.getElementById("serviceSelect");
  select.innerHTML = "";

  if(servicesCache.length === 0){
    select.innerHTML = `<option value="">Нет доступных услуг</option>`;
    return;
  }

  servicesCache.forEach(service => {
    const option = document.createElement("option");
    option.value = service.id;
    option.textContent = `${service.name} — ${service.duration_minutes} мин, ${service.price} ₽`;
    select.appendChild(option);
  });
}


// ---------- Мастер дня (назначается администратором заранее) ----------

async function getAssignedEmployee(date){

  const {data, error} = await supabaseClient
    .from("employee_schedule")
    .select("employee_id, start_time, end_time")
    .eq("date", date)
    .maybeSingle();

  if(error){
    throw new Error("Не удалось проверить расписание мастеров: " + error.message);
  }

  if(!data){
    return null;
  }

  const {data: profileRow} = await supabaseClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", data.employee_id)
    .maybeSingle();

  return {
    employee_id: data.employee_id,
    start_time: data.start_time,
    end_time: data.end_time,
    name: profileRow ? `${profileRow.first_name} ${profileRow.last_name}` : "Мастер"
  };
}


// ---------- Расчёт свободных слотов ----------

async function getBusyIntervals(employeeId, date){

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("start_time, end_time, status")
    .eq("employee_id", employeeId)
    .eq("date", date)
    .neq("status", "cancelled");

  if(error){
    throw new Error("Не удалось проверить занятость мастера: " + error.message);
  }

  return (data || []).map(row => ({
    start: timeStringToMinutes(row.start_time),
    end: timeStringToMinutes(row.end_time)
  }));
}

function overlaps(startA, endA, startB, endB){
  return startA < endB && endA > startB;
}

async function refreshSlots(){

  selectedTime = null;
  assignedEmployeeId = null;
  const container = document.getElementById("slotsContainer");
  container.innerHTML = "";
  showMessage("", false);
  showMasterInfo("");

  const serviceId = document.getElementById("serviceSelect").value;
  const date = document.getElementById("dateInput").value;

  if(!serviceId || !date){
    return;
  }

  const service = servicesCache.find(s => String(s.id) === String(serviceId));
  if(!service){
    return;
  }

  container.innerHTML = `<p>Загрузка свободных слотов...</p>`;

  // Проверка выходного дня салона
  const {data: holidayRows, error: holidayError} = await supabaseClient
    .from("holidays")
    .select("id, reason")
    .eq("date", date);

  if(holidayError){
    container.innerHTML = "";
    showMessage("Не удалось проверить график работы: " + holidayError.message, true);
    return;
  }

  if(holidayRows && holidayRows.length > 0){
    container.innerHTML = "";
    showMessage("В этот день салон не работает" + (holidayRows[0].reason ? ` (${holidayRows[0].reason})` : ""), true);
    return;
  }

  // Мастер, назначенный администратором на эту дату
  let assigned;
  try{
    assigned = await getAssignedEmployee(date);
  }catch(e){
    container.innerHTML = "";
    showMessage(e.message, true);
    return;
  }

  if(!assigned){
    container.innerHTML = "";
    showMessage("На эту дату мастер ещё не назначен администратором. Пожалуйста, выберите другую дату.", true);
    return;
  }

  assignedEmployeeId = assigned.employee_id;
  showMasterInfo(`Мастер дня: ${assigned.name}`);

  let busy;
  try{
    busy = await getBusyIntervals(assigned.employee_id, date);
  }catch(e){
    container.innerHTML = "";
    showMessage(e.message, true);
    return;
  }

  const duration = service.duration_minutes;
  const isToday = date === todayDateString();
  const nowMinutes = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : -1;

  const windowStart = timeStringToMinutes(assigned.start_time);
  const windowEnd = timeStringToMinutes(assigned.end_time);

  const slots = [];

  for(let start = windowStart; start + duration <= windowEnd; start += SLOT_STEP_MINUTES){
    const end = start + duration;

    if(isToday && start <= nowMinutes){
      continue;
    }

    const isBusy = busy.some(b => overlaps(start, end, b.start, b.end));
    if(isBusy){
      continue;
    }

    slots.push(start);
  }

  container.innerHTML = "";

  if(slots.length === 0){
    showMessage("Нет свободных слотов на выбранную дату. Попробуйте другой день.", true);
    return;
  }

  slots.forEach(startMinutes => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.textContent = minutesToDisplay(startMinutes);
    btn.addEventListener("click", () => {
      selectedTime = startMinutes;
      document.querySelectorAll(".slot-btn").forEach(b => b.classList.remove("slot-btn-active"));
      btn.classList.add("slot-btn-active");
    });
    container.appendChild(btn);
  });
}


// ---------- Отправка записи ----------

async function submitBooking(){

  const serviceId = document.getElementById("serviceSelect").value;
  const date = document.getElementById("dateInput").value;

  if(!serviceId || !date){
    showMessage("Заполните услугу и дату", true);
    return;
  }

  if(!assignedEmployeeId){
    showMessage("На эту дату мастер не назначен", true);
    return;
  }

  if(selectedTime === null){
    showMessage("Выберите время записи", true);
    return;
  }

  const isOther = document.getElementById("personOther").checked;

  let bookedForName;
  let bookedForPhone;

  if(isOther){
    bookedForName = document.getElementById("otherName").value.trim();
    bookedForPhone = document.getElementById("otherPhone").value.trim();

    if(!bookedForName){
      showMessage("Укажите ФИО того, кого записываете", true);
      return;
    }
  }else{
    bookedForName = `${currentProfile.last_name} ${currentProfile.first_name}`.trim();
    bookedForPhone = currentProfile.phone || null;
  }

  const service = servicesCache.find(s => String(s.id) === String(serviceId));
  const duration = service.duration_minutes;
  const startTimeStr = minutesToTimeString(selectedTime);
  const endTimeStr = minutesToTimeString(selectedTime + duration);

  const submitBtn = document.getElementById("submitBookingBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Записываем...";

  try{

    // Финальная проверка на занятость прямо перед отправкой —
    // снижает вероятность двойной записи, если кто-то другой
    // забронировал это время параллельно.
    const busy = await getBusyIntervals(assignedEmployeeId, date);
    const newStart = selectedTime;
    const newEnd = selectedTime + duration;
    const stillFree = !busy.some(b => overlaps(newStart, newEnd, b.start, b.end));

    if(!stillFree){
      showMessage("Это время только что заняли. Выберите другое.", true);
      await refreshSlots();
      return;
    }

    const {data: {user}} = await supabaseClient.auth.getUser();

    const {error} = await supabaseClient
      .from("appointments")
      .insert({
        client_id: user.id,
        booked_for_name: bookedForName,
        booked_for_phone: bookedForPhone,
        service_id: serviceId,
        employee_id: assignedEmployeeId,
        date: date,
        start_time: startTimeStr,
        end_time: endTimeStr,
        status: "booked",
        created_by: user.id
      });

    if(error){

      // 23P01 — нарушение exclusion-констрейнта в БД (двойная запись),
      // если такая защита настроена на уровне базы данных.
      if(error.code === "23P01"){
        showMessage("Это время уже занято. Выберите другое.", true);
        await refreshSlots();
        return;
      }

      showMessage("Не удалось создать запись: " + error.message, true);
      return;
    }

    showToast("Запись успешно создана!", "success");
    showMessage("Запись успешно создана!", false);
    setTimeout(() => {
      window.location.href = "appointments.html";
    }, 1200);

  }catch(e){

    showMessage("Произошла ошибка: " + e.message, true);

  }finally{

    submitBtn.disabled = false;
    submitBtn.textContent = "Подтвердить запись";

  }
}


initBooking();
