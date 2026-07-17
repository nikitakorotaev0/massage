// =====================================
// Админ: настройки салона (admin/settings.html)
// =====================================

const SETTINGS_WEEKDAYS = [
  {value: 1, label: "Понедельник"},
  {value: 2, label: "Вторник"},
  {value: 3, label: "Среда"},
  {value: 4, label: "Четверг"},
  {value: 5, label: "Пятница"},
  {value: 6, label: "Суббота"},
  {value: 7, label: "Воскресенье"}
];


async function initAdminSettings(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  renderWeekdayCheckboxes();

  const settings = await fetchSalonSettings();

  document.getElementById("settingWorkStart").value = settings.work_start ? settings.work_start.slice(0,5) : "10:00";
  document.getElementById("settingWorkEnd").value = settings.work_end ? settings.work_end.slice(0,5) : "20:00";
  document.getElementById("settingPhone").value = settings.contact_phone || "";
  document.getElementById("settingEmail").value = settings.contact_email || "";
  document.getElementById("settingAddress").value = settings.address || "";

  const activeDays = (settings.work_days || "1,2,3,4,5,6").split(",").map(n => parseInt(n, 10));

  SETTINGS_WEEKDAYS.forEach(day => {
    const checkbox = document.getElementById(`workDay${day.value}`);
    checkbox.checked = activeDays.includes(day.value);
  });

  document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
}


function renderWeekdayCheckboxes(){

  const container = document.getElementById("workDaysContainer");
  container.innerHTML = "";

  SETTINGS_WEEKDAYS.forEach(day => {
    const label = document.createElement("label");
    label.style.fontWeight = "normal";
    label.style.display = "block";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `workDay${day.value}`;
    checkbox.style.marginRight = "8px";

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(day.label));
    container.appendChild(label);
  });
}


async function saveSettings(){

  const workStart = document.getElementById("settingWorkStart").value;
  const workEnd = document.getElementById("settingWorkEnd").value;
  const phone = document.getElementById("settingPhone").value.trim();
  const email = document.getElementById("settingEmail").value.trim();
  const address = document.getElementById("settingAddress").value.trim();

  if(!workStart || !workEnd){
    showToast("Укажите время начала и конца работы", "error");
    return;
  }

  const selectedDays = SETTINGS_WEEKDAYS
    .filter(day => document.getElementById(`workDay${day.value}`).checked)
    .map(day => day.value);

  if(selectedDays.length === 0){
    showToast("Выберите хотя бы один рабочий день", "error");
    return;
  }

  const btn = document.getElementById("saveSettingsBtn");
  btn.disabled = true;
  btn.textContent = "Сохраняем...";

  const rows = [
    {key: "work_start", value: workStart + ":00"},
    {key: "work_end", value: workEnd + ":00"},
    {key: "work_days", value: selectedDays.join(",")},
    {key: "contact_phone", value: phone || null},
    {key: "contact_email", value: email || null},
    {key: "address", value: address || null}
  ];

  const {error} = await supabaseClient
    .from("settings")
    .upsert(rows, {onConflict: "key"});

  btn.disabled = false;
  btn.textContent = "Сохранить настройки";

  if(error){
    showToast("Не удалось сохранить настройки: " + error.message, "error");
    return;
  }

  showToast("Настройки сохранены", "success");
}
