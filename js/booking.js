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
let appliedPromo = null;


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
  const box = document.getElementById("bookingAlert");
  if(!box) return;
  box.textContent = text;
  box.style.display = text ? "block" : "none";
  box.className = "booking-alert " + (isError ? "booking-alert-error" : "booking-alert-success");
  if(text && isError){
    box.scrollIntoView({behavior: "smooth", block: "center"});
  }
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

  renderQuickDateChips();
  dateInput.addEventListener("change", () => {
    updateQuickDateChipsActiveState();
    refreshSlots();
  });

  document.getElementById("personSelf").addEventListener("change", toggleOtherPersonFields);
  document.getElementById("personOther").addEventListener("change", toggleOtherPersonFields);
  toggleOtherPersonFields();

  await loadServices();

  document.getElementById("serviceSelect").addEventListener("change", onServiceSelectionChanged);

  document.getElementById("addServiceBtn").addEventListener("click", addServiceRow);

  document.getElementById("applyPromoBtn").addEventListener("click", applyPromoCode);
  document.getElementById("submitBookingBtn").addEventListener("click", submitBooking);

  await refreshSlots();
}


function renderQuickDateChips(){

  const container = document.getElementById("quickDateChips");
  if(!container) return;

  const options = [
    {label: "Сегодня", offset: 0},
    {label: "Завтра", offset: 1},
    {label: "Послезавтра", offset: 2}
  ];

  container.innerHTML = "";

  options.forEach(opt => {
    const d = new Date();
    d.setDate(d.getDate() + opt.offset);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "quick-date-chip";
    chip.dataset.date = dateStr;
    chip.textContent = opt.label;

    chip.addEventListener("click", () => {
      document.getElementById("dateInput").value = dateStr;
      updateQuickDateChipsActiveState();
      refreshSlots();
    });

    container.appendChild(chip);
  });

  updateQuickDateChipsActiveState();
}


function updateQuickDateChipsActiveState(){

  const container = document.getElementById("quickDateChips");
  if(!container) return;

  const currentValue = document.getElementById("dateInput").value;

  container.querySelectorAll(".quick-date-chip").forEach(chip => {
    chip.classList.toggle("quick-date-chip-active", chip.dataset.date === currentValue);
  });
}


function onServiceSelectionChanged(){
  rebuildServiceOptions();
  clearAppliedPromo();
  refreshSlots();
}


// ---------- Несколько услуг в одной записи ----------

let additionalServiceRowCounter = 0;

function getAllServiceSelects(){
  return [
    document.getElementById("serviceSelect"),
    ...document.querySelectorAll(".additional-service-select")
  ];
}

function getSelectedServices(){

  const services = [];

  getAllServiceSelects().forEach(select => {
    const service = servicesCache.find(s => String(s.id) === String(select.value));
    if(service){
      services.push(service);
    }
  });

  return services;
}


// Перестраивает варианты во всех select'ах услуг: первая услуга —
// только "основная" или "смешанная"; дополнительные — только
// "дополнительная" или "смешанная". Также убирает из списков услуги,
// уже выбранные в других select'ах, чтобы нельзя было выбрать
// одну и ту же услугу дважды.
function rebuildServiceOptions(){

  const selects = getAllServiceSelects();
  const currentValues = selects.map(s => s.value);

  selects.forEach((select, index) => {

    const isFirst = index === 0;
    const pool = servicesCache.filter(s => isFirst ? (s.service_type !== "additional") : (s.service_type !== "primary"));

    const ownValue = currentValues[index];
    const otherValues = currentValues.filter((v, i) => i !== index);

    const available = pool.filter(s => String(s.id) === String(ownValue) || !otherValues.includes(String(s.id)));

    select.innerHTML = "";

    if(available.length === 0){
      select.innerHTML = `<option value="">Нет доступных услуг</option>`;
      return;
    }

    available.forEach(service => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = `${service.name} — ${service.duration_minutes} мин, ${service.price} ₽`;
      select.appendChild(option);
    });

    if(available.some(s => String(s.id) === String(ownValue))){
      select.value = ownValue;
    }
  });
}


function addServiceRow(){

  additionalServiceRowCounter++;
  const rowId = `additional-service-row-${additionalServiceRowCounter}`;

  const row = document.createElement("div");
  row.id = rowId;
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.marginTop = "10px";
  row.style.alignItems = "center";
  row.classList.add("service-row-enter");

  const select = document.createElement("select");
  select.className = "additional-service-select";
  select.style.flex = "1";

  select.addEventListener("change", onServiceSelectionChanged);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-danger";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    row.classList.add("service-row-leave");
    setTimeout(() => {
      row.remove();
      onServiceSelectionChanged();
    }, 180);
  });

  row.appendChild(select);
  row.appendChild(removeBtn);

  document.getElementById("additionalServicesContainer").appendChild(row);

  onServiceSelectionChanged();
}


function toggleOtherPersonFields(){
  const isOther = document.getElementById("personOther").checked;
  document.getElementById("otherPersonFields").style.display = isOther ? "flex" : "none";
}


// ---------- Загрузка справочников ----------

async function loadServices(){

  const {data, error} = await supabaseClient
    .from("services")
    .select("id, name, description, duration_minutes, price, service_type")
    .eq("is_active", true)
    .order("name");

  if(error){
    showMessage("Не удалось загрузить список услуг: " + error.message, true);
    return;
  }

  servicesCache = data || [];

  if(servicesCache.length === 0){
    document.getElementById("serviceSelect").innerHTML = `<option value="">Нет доступных услуг</option>`;
    return;
  }

  rebuildServiceOptions();
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

  const selectedServices = getSelectedServices();
  if(selectedServices.length === 0){
    return;
  }

  updatePriceDisplay();

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

  // Проверка рабочего дня недели по настройкам салона
  // (по умолчанию Пн–Сб, пока админ явно не задал другое в настройках)
  const salonSettings = await fetchSalonSettings();
  const workDaysStr = salonSettings.work_days || "1,2,3,4,5,6";

  const [y, m, d] = date.split("-").map(n => parseInt(n, 10));
  const jsDay = new Date(y, m - 1, d).getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  const workDays = workDaysStr.split(",").map(n => parseInt(n, 10));

  if(!workDays.includes(isoDay)){
    container.innerHTML = "";
    showMessage("В этот день недели салон не работает. Пожалуйста, выберите другую дату.", true);
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

  const duration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);
  const isToday = date === todayDateString();
  const nowMinutes = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : -1;

  const salonWorkStart = timeStringToMinutes(salonSettings.work_start || "10:00:00");
  const salonWorkEnd = timeStringToMinutes(salonSettings.work_end || "20:00:00");

  const windowStart = Math.max(timeStringToMinutes(assigned.start_time), salonWorkStart);
  const windowEnd = Math.min(timeStringToMinutes(assigned.end_time), salonWorkEnd);

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

  if(!document.getElementById("consentCheckbox").checked){
    showMessage("Чтобы записаться, подтвердите согласие на оказание услуг", true);
    return;
  }

  const serviceId = document.getElementById("serviceSelect").value;
  const date = document.getElementById("dateInput").value;

  if(!serviceId || !date){
    showMessage("Заполните услугу и дату", true);
    return;
  }

  const selectedServices = getSelectedServices();

  if(selectedServices.length === 0){
    showMessage("Выберите хотя бы одну услугу", true);
    return;
  }

  if(!assignedEmployeeId){
    // Перепроверяем и показываем актуальную причину (выходной,
    // нерабочий день недели, мастер не назначен и т.д.),
    // а не общий текст, который может ввести в заблуждение.
    await refreshSlots();
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

  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

  const submitBtn = document.getElementById("submitBookingBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Записываем...";

  try{

    // Финальная проверка на занятость прямо перед отправкой —
    // снижает вероятность двойной записи, если кто-то другой
    // забронировал это время параллельно. Проверяем весь блок
    // (все выбранные услуги подряд), а не только первую услугу.
    const busy = await getBusyIntervals(assignedEmployeeId, date);
    const newStart = selectedTime;
    const newEnd = selectedTime + totalDuration;
    const stillFree = !busy.some(b => overlaps(newStart, newEnd, b.start, b.end));

    if(!stillFree){
      showMessage("Это время только что заняли. Выберите другое.", true);
      await refreshSlots();
      return;
    }

    let promoIdToSave = null;

    // Промокод применим только при записи на одну услугу —
    // при нескольких услугах промокод не используется.
    if(appliedPromo && selectedServices.length === 1){

      // Перепроверяем промокод прямо перед вставкой — на случай,
      // если лимит использований исчерпался, пока клиент заполнял форму.
      const {data: freshPromo, error: promoCheckError} = await supabaseClient
        .from("promo_codes")
        .select("id, discount, free_service_id, uses_left, active, starts_at, expires_at")
        .eq("id", appliedPromo.id)
        .maybeSingle();

      if(promoCheckError || !freshPromo || !freshPromo.active || (freshPromo.uses_left !== null && freshPromo.uses_left <= 0)){
        showMessage("Промокод больше не действует. Уберите его и повторите запись.", true);
        appliedPromo = null;
        updatePriceDisplay();
        return;
      }

      promoIdToSave = freshPromo.id;
    }

    const {data: {user}} = await supabaseClient.auth.getUser();

    const groupId = crypto.randomUUID();

    let cursor = selectedTime;
    const rows = [];

    selectedServices.forEach(service => {

      const rowStart = cursor;
      const rowEnd = cursor + service.duration_minutes;
      cursor = rowEnd;

      const rowFinalPrice = (promoIdToSave && selectedServices.length === 1)
        ? computeFinalPrice(service)
        : service.price;

      rows.push({
        client_id: user.id,
        booked_for_name: bookedForName,
        booked_for_phone: bookedForPhone,
        service_id: service.id,
        employee_id: assignedEmployeeId,
        date: date,
        start_time: minutesToTimeString(rowStart),
        end_time: minutesToTimeString(rowEnd),
        status: "booked",
        created_by: user.id,
        promo_id: promoIdToSave,
        final_price: rowFinalPrice,
        booking_group_id: groupId
      });
    });

    const {error} = await supabaseClient
      .from("appointments")
      .insert(rows);

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

    if(promoIdToSave){

      const {data: promoRow} = await supabaseClient
        .from("promo_codes")
        .select("uses_left")
        .eq("id", promoIdToSave)
        .maybeSingle();

      if(promoRow && promoRow.uses_left !== null){
        await supabaseClient
          .from("promo_codes")
          .update({uses_left: Math.max(0, promoRow.uses_left - 1)})
          .eq("id", promoIdToSave);
      }
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


// ---------- Промокод ----------

function showPromoMessage(text, isError){
  const box = document.getElementById("promoMessage");
  if(!box) return;
  box.textContent = text;
  box.style.display = text ? "block" : "none";
  box.style.color = isError ? "#b02a2a" : "#173f35";
}

function clearAppliedPromo(){
  appliedPromo = null;
  showPromoMessage("", false);
  updatePriceDisplay();
}

function updatePriceDisplay(){

  const priceBox = document.getElementById("priceInfo");
  const selectedServices = getSelectedServices();

  if(selectedServices.length === 0){
    priceBox.style.display = "none";
    return;
  }

  const promoSection = document.getElementById("promoSection");
  const promoUnavailableNote = document.getElementById("promoUnavailableNote");

  if(selectedServices.length > 1){
    if(appliedPromo){
      appliedPromo = null;
    }
    promoSection.style.display = "none";
    promoUnavailableNote.style.display = "block";
  }else{
    promoSection.style.display = "block";
    promoUnavailableNote.style.display = "none";
  }

  const totalBasePrice = selectedServices.reduce((sum, s) => sum + s.price, 0);

  priceBox.style.display = "block";

  if(selectedServices.length === 1 && appliedPromo){
    const finalPrice = computeFinalPrice(selectedServices[0]);
    if(finalPrice !== totalBasePrice){
      priceBox.innerHTML = `Стоимость: <s>${totalBasePrice} ₽</s> <strong>${finalPrice} ₽</strong>`;
      return;
    }
  }

  priceBox.innerHTML = `Стоимость: <strong>${totalBasePrice} ₽</strong>`;
}

function computeFinalPrice(service){

  if(!appliedPromo){
    return service.price;
  }

  if(appliedPromo.free_service_id){
    return String(appliedPromo.free_service_id) === String(service.id) ? 0 : service.price;
  }

  if(appliedPromo.discount){
    return Math.round(service.price * (100 - appliedPromo.discount) / 100);
  }

  return service.price;
}


async function applyPromoCode(){

  const codeInput = document.getElementById("promoCodeInput");
  const code = codeInput.value.trim().toUpperCase();

  if(!code){
    showPromoMessage("Введите промокод", true);
    return;
  }

  const selectedServices = getSelectedServices();

  if(selectedServices.length !== 1){
    showPromoMessage("Промокод можно применить только при записи на одну услугу", true);
    return;
  }

  const service = selectedServices[0];

  const {data: promo, error} = await supabaseClient
    .from("promo_codes")
    .select("id, code, discount, free_service_id, uses_left, starts_at, expires_at, active")
    .eq("code", code)
    .maybeSingle();

  if(error){
    showPromoMessage("Не удалось проверить промокод: " + error.message, true);
    return;
  }

  if(!promo){
    showPromoMessage("Промокод не найден", true);
    return;
  }

  if(!promo.active){
    showPromoMessage("Промокод больше не действует", true);
    return;
  }

  const today = todayDateString();

  if(promo.starts_at && promo.starts_at > today){
    showPromoMessage("Этот промокод ещё не начал действовать", true);
    return;
  }

  if(promo.expires_at && promo.expires_at < today){
    showPromoMessage("Срок действия промокода истёк", true);
    return;
  }

  if(promo.uses_left !== null && promo.uses_left <= 0){
    showPromoMessage("Промокод уже исчерпан", true);
    return;
  }

  if(promo.free_service_id && String(promo.free_service_id) !== String(service.id)){
    showPromoMessage("Этот промокод действует только на определённую услугу. Выберите её, чтобы применить код.", true);
    return;
  }

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {data: previousUse, error: usageError} = await supabaseClient
    .from("appointments")
    .select("id")
    .eq("client_id", user.id)
    .eq("promo_id", promo.id)
    .neq("status", "cancelled")
    .maybeSingle();

  if(usageError){
    showPromoMessage("Не удалось проверить использование промокода: " + usageError.message, true);
    return;
  }

  if(previousUse){
    showPromoMessage("Вы уже использовали этот промокод", true);
    return;
  }

  appliedPromo = promo;
  showPromoMessage(`Промокод «${promo.code}» применён`, false);
  updatePriceDisplay();
}


// ---------- Инициализация ----------

initBooking();
