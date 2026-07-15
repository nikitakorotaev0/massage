// =====================================
// Кабинет сотрудника: учёт смен (Начать смену / Закончить смену)
// =====================================

let currentShiftRow = null;
let shiftEmployeeId = null;

function shiftTodayDateString(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


async function initEmployeeShift(){

  const profile = await getProfile();

  if(!profile || (profile.role !== "employee" && profile.role !== "admin")){
    showToast("Доступ только для сотрудников", "error");
    window.location.href = "../login.html";
    return;
  }

  const {data: {user}} = await supabaseClient.auth.getUser();
  shiftEmployeeId = user.id;

  document.getElementById("startShiftBtn").addEventListener("click", startShift);
  document.getElementById("endShiftBtn").addEventListener("click", endShift);

  await renderTodaySchedule();
  await refreshShiftStatus();
}


async function renderTodaySchedule(){

  const box = document.getElementById("todayScheduleInfo");
  const today = shiftTodayDateString();

  const {data, error} = await supabaseClient
    .from("employee_schedule")
    .select("employee_id, start_time, end_time")
    .eq("date", today)
    .maybeSingle();

  if(error || !data){
    box.textContent = "На сегодня вы не назначены администратором в расписании.";
    return;
  }

  if(data.employee_id === shiftEmployeeId){
    box.textContent = `Сегодня вы назначены мастером дня: ${data.start_time.slice(0,5)}–${data.end_time.slice(0,5)}.`;
  }else{
    box.textContent = "Сегодня мастером дня назначен другой сотрудник.";
  }
}


async function refreshShiftStatus(){

  const today = shiftTodayDateString();

  const {data, error} = await supabaseClient
    .from("employee_shifts")
    .select("id, shift_start, shift_end")
    .eq("employee_id", shiftEmployeeId)
    .eq("shift_date", today)
    .is("shift_end", null)
    .order("shift_start", {ascending: false})
    .limit(1)
    .maybeSingle();

  if(error){
    showToast("Не удалось загрузить статус смены: " + error.message, "error");
    return;
  }

  currentShiftRow = data || null;

  const statusBox = document.getElementById("shiftStatus");
  const startBtn = document.getElementById("startShiftBtn");
  const endBtn = document.getElementById("endShiftBtn");

  if(currentShiftRow){
    const startTime = new Date(currentShiftRow.shift_start);
    statusBox.textContent = `Смена активна с ${startTime.toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"})}`;
    startBtn.style.display = "none";
    endBtn.style.display = "inline-block";
  }else{
    statusBox.textContent = "Смена не начата.";
    startBtn.style.display = "inline-block";
    endBtn.style.display = "none";
  }
}


async function startShift(){

  if(currentShiftRow){
    return;
  }

  const btn = document.getElementById("startShiftBtn");
  btn.disabled = true;

  const {error} = await supabaseClient
    .from("employee_shifts")
    .insert({
      employee_id: shiftEmployeeId,
      shift_date: shiftTodayDateString(),
      shift_start: new Date().toISOString()
    });

  btn.disabled = false;

  if(error){
    showToast("Не удалось начать смену: " + error.message, "error");
    return;
  }

  showToast("Смена начата", "success");
  await refreshShiftStatus();
}


async function endShift(){

  if(!currentShiftRow){
    return;
  }

  const confirmed = await showConfirm("Завершить смену?");
  if(!confirmed){
    return;
  }

  const btn = document.getElementById("endShiftBtn");
  btn.disabled = true;

  const {error} = await supabaseClient
    .from("employee_shifts")
    .update({shift_end: new Date().toISOString()})
    .eq("id", currentShiftRow.id);

  btn.disabled = false;

  if(error){
    showToast("Не удалось завершить смену: " + error.message, "error");
    return;
  }

  showToast("Смена завершена", "success");
  await refreshShiftStatus();
}
