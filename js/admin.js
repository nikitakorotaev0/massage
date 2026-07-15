// =====================================
// Админ-панель: управление пользователями и заявками на удаление
// =====================================

let allUsersCache = [];
let currentAdminId = null;

const ROLE_LABELS = {
  client: "Клиент",
  employee: "Сотрудник",
  admin: "Администратор"
};


async function initAdminUsers(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  currentAdminId = profile.id;

  document.getElementById("searchInput").addEventListener("input", applyUserSearch);

  await loadAllUsers();
}


async function loadAllUsers(){

  const container = document.getElementById("usersContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data, error} = await supabaseClient
    .from("profiles")
    .select("id, first_name, last_name, email, phone, role, is_banned, deletion_requested, deletion_requested_at")
    .order("deletion_requested", {ascending: false})
    .order("last_name", {ascending: true});

  if(error){
    container.innerHTML = `<p>Не удалось загрузить пользователей: ${error.message}</p>`;
    return;
  }

  allUsersCache = data || [];
  renderUsers(allUsersCache);
}


function applyUserSearch(){

  const query = document.getElementById("searchInput").value.trim().toLowerCase();

  if(!query){
    renderUsers(allUsersCache);
    return;
  }

  const filtered = allUsersCache.filter(u => {
    const haystack = `${u.first_name} ${u.last_name} ${u.email || ""} ${u.phone || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  renderUsers(filtered);
}


function renderUsers(users){

  const container = document.getElementById("usersContainer");
  container.innerHTML = "";

  if(users.length === 0){
    container.innerHTML = `<p>Пользователи не найдены.</p>`;
    return;
  }

  users.forEach((user, index) => {

    const card = document.createElement("div");
    card.className = "card";
    if(user.deletion_requested){
      card.classList.add("danger-zone");
    }
    if(index > 0){
      card.style.marginTop = "20px";
    }

    card.innerHTML = `
      <h2>${user.last_name} ${user.first_name}</h2>

      <p><strong>Роль:</strong><br>${ROLE_LABELS[user.role] || user.role}</p>

      <p><strong>Email:</strong><br>${user.email || "Не указано"}</p>

      <p><strong>Телефон:</strong><br>${user.phone || "Не указано"}</p>

      ${user.is_banned && !user.deletion_requested ? `<p><strong>Статус:</strong><br>Заблокирован</p>` : ""}

      ${user.deletion_requested ? `<p><strong>⚠ Заявка на удаление</strong><br>Подана: ${new Date(user.deletion_requested_at).toLocaleString("ru-RU")}</p>` : ""}
    `;

    if(user.id === currentAdminId){

      const note = document.createElement("p");
      note.style.opacity = "0.7";
      note.style.marginTop = "10px";
      note.textContent = "Это ваш аккаунт";
      card.appendChild(note);

    }else if(user.deletion_requested){

      const approveBtn = document.createElement("button");
      approveBtn.className = "btn btn-danger";
      approveBtn.type = "button";
      approveBtn.style.marginTop = "10px";
      approveBtn.textContent = "Подтвердить удаление";
      approveBtn.addEventListener("click", () => approveDeletion(user.id, `${user.last_name} ${user.first_name}`));

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "btn";
      rejectBtn.type = "button";
      rejectBtn.style.marginTop = "10px";
      rejectBtn.style.marginLeft = "10px";
      rejectBtn.textContent = "Отклонить заявку";
      rejectBtn.addEventListener("click", () => rejectDeletion(user.id, `${user.last_name} ${user.first_name}`));

      card.appendChild(approveBtn);
      card.appendChild(rejectBtn);

    }else{

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger";
      deleteBtn.type = "button";
      deleteBtn.style.marginTop = "10px";
      deleteBtn.textContent = "Удалить аккаунт";
      deleteBtn.addEventListener("click", () => deleteUserAsAdmin(user.id, `${user.last_name} ${user.first_name}`));

      card.appendChild(deleteBtn);

    }

    container.appendChild(card);
  });
}


// Полная зачистка данных пользователя из всех таблиц.
// Само учётное имя/пароль (auth.users) при этом не удаляется —
// это требует привилегированного серверного вызова, которого
// в этом проекте сознательно нет. Доступ пользователя всё равно
// закрыт: после удаления профиля вход в личный кабинет невозможен.
async function wipeUserData(userId){

  await supabaseClient.from("reviews").delete().eq("client_id", userId);
  await supabaseClient.from("employee_notes").delete().eq("client_id", userId);
  await supabaseClient.from("employee_notes").delete().eq("employee_id", userId);

  await supabaseClient
    .from("appointments")
    .delete()
    .or(`client_id.eq.${userId},employee_id.eq.${userId},created_by.eq.${userId}`);

  await supabaseClient.from("employee_schedule").delete().eq("employee_id", userId);
  await supabaseClient.from("employee_shifts").delete().eq("employee_id", userId);
  await supabaseClient.from("employees").delete().eq("user_id", userId);
  await supabaseClient.from("client_profiles").delete().eq("user_id", userId);

  const {error} = await supabaseClient.from("profiles").delete().eq("id", userId);

  return error;
}


async function approveDeletion(targetUserId, displayName){

  const confirmed = await showConfirm(`Подтвердить удаление аккаунта «${displayName}»? Все данные пользователя будут удалены безвозвратно.`);

  if(!confirmed){
    return;
  }

  const error = await wipeUserData(targetUserId);

  if(error){
    showToast("Не удалось полностью удалить аккаунт: " + error.message, "error");
    return;
  }

  showToast("Аккаунт удалён", "success");
  await loadAllUsers();
}


async function rejectDeletion(targetUserId, displayName){

  const confirmed = await showConfirm(`Отклонить заявку на удаление аккаунта «${displayName}»? Доступ будет восстановлен.`);

  if(!confirmed){
    return;
  }

  const {error} = await supabaseClient
    .from("profiles")
    .update({
      is_banned: false,
      ban_reason: null,
      deletion_requested: false,
      deletion_requested_at: null
    })
    .eq("id", targetUserId);

  if(error){
    showToast("Не удалось отклонить заявку: " + error.message, "error");
    return;
  }

  showToast("Заявка отклонена, доступ восстановлен", "success");
  await loadAllUsers();
}


async function deleteUserAsAdmin(targetUserId, displayName){

  const confirmed = await showConfirm(`Удалить аккаунт «${displayName}»? Все данные пользователя будут удалены безвозвратно.`);

  if(!confirmed){
    return;
  }

  const error = await wipeUserData(targetUserId);

  if(error){
    showToast("Не удалось удалить аккаунт: " + error.message, "error");
    return;
  }

  showToast("Аккаунт удалён", "success");
  await loadAllUsers();
}


// =====================================
// Админ: управление сотрудниками (admin/employees.html)
// =====================================

let employeeCandidateResults = [];
let selectedCandidate = null;


async function initAdminEmployees(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  document.getElementById("candidateSearchBtn").addEventListener("click", searchEmployeeCandidates);
  document.getElementById("candidateSearchInput").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      searchEmployeeCandidates();
    }
  });

  document.getElementById("assignEmployeeBtn").addEventListener("click", promoteToEmployee);

  await loadEmployeesList();
}


async function searchEmployeeCandidates(){

  const query = document.getElementById("candidateSearchInput").value.trim();
  const resultsContainer = document.getElementById("candidateResults");

  selectedCandidate = null;
  document.getElementById("assignFormBox").style.display = "none";

  if(!query){
    resultsContainer.innerHTML = "";
    return;
  }

  const {data, error} = await supabaseClient
    .from("profiles")
    .select("id, first_name, last_name, phone, role")
    .eq("role", "client")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(20);

  if(error){
    resultsContainer.innerHTML = `<p>Ошибка поиска: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    resultsContainer.innerHTML = `<p>Клиенты не найдены (сотрудником можно назначить только существующего зарегистрированного клиента).</p>`;
    return;
  }

  resultsContainer.innerHTML = "";

  data.forEach(candidate => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.style.marginRight = "10px";
    btn.style.marginTop = "10px";
    btn.textContent = `${candidate.last_name} ${candidate.first_name}`;
    btn.addEventListener("click", () => {
      selectedCandidate = candidate;
      document.getElementById("assignFormBox").style.display = "block";
      document.getElementById("assignFormName").textContent = `${candidate.last_name} ${candidate.first_name}`;
    });
    resultsContainer.appendChild(btn);
  });
}


async function promoteToEmployee(){

  if(!selectedCandidate){
    showToast("Сначала выберите клиента", "error");
    return;
  }

  const position = document.getElementById("newEmployeePosition").value.trim();

  if(!position){
    showToast("Укажите должность", "error");
    return;
  }

  const btn = document.getElementById("assignEmployeeBtn");
  btn.disabled = true;
  btn.textContent = "Назначаем...";

  const today = new Date().toISOString().slice(0, 10);

  const {error: employeeError} = await supabaseClient
    .from("employees")
    .upsert({
      user_id: selectedCandidate.id,
      position: position,
      hire_date: today,
      is_active: true
    }, {onConflict: "user_id"});

  if(employeeError){
    showToast("Не удалось создать запись сотрудника: " + employeeError.message, "error");
    btn.disabled = false;
    btn.textContent = "Назначить сотрудником";
    return;
  }

  const {error: profileError} = await supabaseClient
    .from("profiles")
    .update({role: "employee"})
    .eq("id", selectedCandidate.id);

  btn.disabled = false;
  btn.textContent = "Назначить сотрудником";

  if(profileError){
    showToast("Сотрудник создан, но не удалось обновить роль: " + profileError.message, "error");
    return;
  }

  showToast("Сотрудник назначен", "success");

  document.getElementById("assignFormBox").style.display = "none";
  document.getElementById("newEmployeePosition").value = "";
  document.getElementById("candidateSearchInput").value = "";
  document.getElementById("candidateResults").innerHTML = "";
  selectedCandidate = null;

  await loadEmployeesList();
}


async function loadEmployeesList(){

  const container = document.getElementById("employeesListContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data: employeeRows, error} = await supabaseClient
    .from("employees")
    .select("user_id, position, hire_date, is_active");

  if(error){
    container.innerHTML = `<p>Не удалось загрузить сотрудников: ${error.message}</p>`;
    return;
  }

  const userIds = (employeeRows || []).map(r => r.user_id);
  let profilesById = {};

  if(userIds.length > 0){
    const {data: profileRows} = await supabaseClient
      .from("profiles")
      .select("id, first_name, last_name, role")
      .in("id", userIds);

    (profileRows || []).forEach(p => { profilesById[p.id] = p; });
  }

  // Администраторов не показываем в этом списке — их статус
  // сотрудника управляется отдельно, чтобы не было риска случайно
  // "уволить" администратора через эту форму.
  const staffRows = (employeeRows || []).filter(row => {
    const p = profilesById[row.user_id];
    return p && p.role !== "admin";
  });

  if(staffRows.length === 0){
    container.innerHTML = `<p>Сотрудников пока нет.</p>`;
    return;
  }

  container.innerHTML = "";

  staffRows.forEach((row, index) => {

    const p = profilesById[row.user_id];

    const card = document.createElement("div");
    card.className = "card";
    if(index > 0){
      card.style.marginTop = "20px";
    }

    const hireDateText = row.hire_date ? row.hire_date.split("-").reverse().join(".") : "Не указано";

    card.innerHTML = `
      <h2>${p.last_name} ${p.first_name}</h2>
      <p><strong>Должность:</strong><br>${row.position || "Не указана"}</p>
      <p><strong>Дата найма:</strong><br>${hireDateText}</p>
      <p><strong>Статус:</strong><br>${row.is_active ? "Работает" : "Уволен(а)"}</p>
    `;

    const toggleBtn = document.createElement("button");
    toggleBtn.className = row.is_active ? "btn btn-danger" : "btn";
    toggleBtn.type = "button";
    toggleBtn.style.marginTop = "10px";
    toggleBtn.textContent = row.is_active ? "Уволить" : "Восстановить";
    toggleBtn.addEventListener("click", () => toggleEmployeeActive(row));

    card.appendChild(toggleBtn);
    container.appendChild(card);
  });
}


async function toggleEmployeeActive(row){

  const newActive = !row.is_active;

  const confirmed = await showConfirm(
    newActive ? "Восстановить сотрудника в должности?" : "Уволить сотрудника? Доступ в кабинет сотрудника будет закрыт."
  );

  if(!confirmed){
    return;
  }

  const {error: employeeError} = await supabaseClient
    .from("employees")
    .update({is_active: newActive})
    .eq("user_id", row.user_id);

  if(employeeError){
    showToast("Не удалось обновить статус: " + employeeError.message, "error");
    return;
  }

  const {error: profileError} = await supabaseClient
    .from("profiles")
    .update({role: newActive ? "employee" : "client"})
    .eq("id", row.user_id);

  if(profileError){
    showToast("Статус сотрудника обновлён, но не удалось обновить роль: " + profileError.message, "error");
    return;
  }

  showToast(newActive ? "Сотрудник восстановлен" : "Сотрудник уволен", "success");
  await loadEmployeesList();
}


// =====================================
// Админ: главная панель (admin/dashboard.html)
// =====================================

async function initAdminDashboard(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  await loadDashboardCounters();
  await loadTodayAppointmentsPreview();
}


async function loadDashboardCounters(){

  const today = new Date().toISOString().slice(0, 10);

  const {count: todayCount} = await supabaseClient
    .from("appointments")
    .select("id", {count: "exact", head: true})
    .eq("date", today)
    .neq("status", "cancelled");

  document.getElementById("dashTodayAppointments").textContent = todayCount ?? "—";

  const {count: clientsCount} = await supabaseClient
    .from("profiles")
    .select("id", {count: "exact", head: true})
    .eq("role", "client");

  document.getElementById("dashClients").textContent = clientsCount ?? "—";

  const {count: employeesCount} = await supabaseClient
    .from("employees")
    .select("user_id", {count: "exact", head: true})
    .eq("is_active", true);

  document.getElementById("dashEmployees").textContent = employeesCount ?? "—";
}


const ADMIN_STATUS_LABELS = {
  booked: "Ожидает посещения",
  completed: "Завершено",
  cancelled: "Отменено",
  no_show: "Не пришёл"
};


async function loadTodayAppointmentsPreview(){

  const container = document.getElementById("dashTodayList");
  container.innerHTML = `<p>Загрузка...</p>`;

  const today = new Date().toISOString().slice(0, 10);

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("id, service_id, employee_id, start_time, status, booked_for_name")
    .eq("date", today)
    .neq("status", "cancelled")
    .order("start_time", {ascending: true});

  if(error){
    container.innerHTML = `<p>Не удалось загрузить записи: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p>На сегодня записей нет.</p>`;
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

  container.innerHTML = "";

  data.forEach((a, index) => {

    const card = document.createElement("div");
    card.className = "card";
    if(index > 0){
      card.style.marginTop = "15px";
    }

    const serviceName = servicesById[a.service_id] ? servicesById[a.service_id].name : "Услуга";
    const employeeName = profilesById[a.employee_id] ? `${profilesById[a.employee_id].first_name} ${profilesById[a.employee_id].last_name}` : "—";

    card.innerHTML = `
      <h3>${a.start_time.slice(0,5)} — ${a.booked_for_name}</h3>
      <p><strong>Услуга:</strong><br>${serviceName}</p>
      <p><strong>Мастер:</strong><br>${employeeName}</p>
      <p><strong>Статус:</strong><br>${ADMIN_STATUS_LABELS[a.status] || a.status}</p>
    `;

    container.appendChild(card);
  });
}
