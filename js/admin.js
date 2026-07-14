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
    alert("Доступ только для администраторов");
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

  await supabaseClient
    .from("appointments")
    .delete()
    .or(`client_id.eq.${userId},employee_id.eq.${userId},created_by.eq.${userId}`);

  await supabaseClient.from("employee_schedule").delete().eq("employee_id", userId);
  await supabaseClient.from("employees").delete().eq("user_id", userId);
  await supabaseClient.from("client_profiles").delete().eq("user_id", userId);

  const {error} = await supabaseClient.from("profiles").delete().eq("id", userId);

  return error;
}


async function approveDeletion(targetUserId, displayName){

  const confirmed = confirm(`Подтвердить удаление аккаунта «${displayName}»? Все данные пользователя будут удалены безвозвратно.`);

  if(!confirmed){
    return;
  }

  const error = await wipeUserData(targetUserId);

  if(error){
    alert("Не удалось полностью удалить аккаунт: " + error.message);
    return;
  }

  await loadAllUsers();
}


async function rejectDeletion(targetUserId, displayName){

  const confirmed = confirm(`Отклонить заявку на удаление аккаунта «${displayName}»? Доступ будет восстановлен.`);

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
    alert("Не удалось отклонить заявку: " + error.message);
    return;
  }

  await loadAllUsers();
}


async function deleteUserAsAdmin(targetUserId, displayName){

  const confirmed = confirm(`Удалить аккаунт «${displayName}»? Все данные пользователя будут удалены безвозвратно.`);

  if(!confirmed){
    return;
  }

  const error = await wipeUserData(targetUserId);

  if(error){
    alert("Не удалось удалить аккаунт: " + error.message);
    return;
  }

  await loadAllUsers();
}
