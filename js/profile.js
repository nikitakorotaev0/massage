// =====================================
// Профиль клиента: личные данные и медицинская информация
// =====================================


function formatDateRuShort(dateStr){
  if(!dateStr) return "Не указано";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}


// ---------- Просмотр профиля (client/profile.html) ----------

async function initProfileView(){

  const profile = await getProfile();

  if(!profile){
    window.location.href = "../login.html";
    return;
  }

  const fullName = [profile.last_name, profile.first_name, profile.middle_name]
    .filter(Boolean)
    .join(" ");

  document.getElementById("fullNameView").textContent = fullName;
  document.getElementById("birthDateView").textContent = formatDateRuShort(profile.birth_date);
  document.getElementById("emailView").textContent = profile.email || "Не указано";
  document.getElementById("phoneView").textContent = profile.phone || "Не указано";

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {data: clientProfile, error} = await supabaseClient
    .from("client_profiles")
    .select("contraindications, notes")
    .eq("user_id", user.id)
    .maybeSingle();

  if(error){
    console.log(error);
  }

  document.getElementById("contraindicationsView").textContent =
    (clientProfile && clientProfile.contraindications) ? clientProfile.contraindications : "Пока данные не заполнены.";

  document.getElementById("notesView").textContent =
    (clientProfile && clientProfile.notes) ? clientProfile.notes : "Пока данных нет.";
}


// ---------- Редактирование личных данных (client/edit-profile.html) ----------

async function initEditProfile(){

  const profile = await getProfile();

  if(!profile){
    window.location.href = "../login.html";
    return;
  }

  document.getElementById("firstName").value = profile.first_name || "";
  document.getElementById("lastName").value = profile.last_name || "";
  document.getElementById("middleName").value = profile.middle_name || "";
  document.getElementById("birthDate").value = profile.birth_date || "";
  document.getElementById("email").value = profile.email || "";
  document.getElementById("phone").value = profile.phone || "";

  document.getElementById("saveProfileBtn").addEventListener("click", saveProfile);
}


async function saveProfile(){

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const middleName = document.getElementById("middleName").value.trim();
  const birthDate = document.getElementById("birthDate").value;
  const phone = document.getElementById("phone").value.trim();

  if(!firstName || !lastName){
    showToast("Имя и фамилия обязательны", "error");
    return;
  }

  const btn = document.getElementById("saveProfileBtn");
  btn.disabled = true;
  btn.textContent = "Сохраняем...";

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {error} = await supabaseClient
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      middle_name: middleName || null,
      birth_date: birthDate || null,
      phone: phone || null
    })
    .eq("id", user.id);

  btn.disabled = false;
  btn.textContent = "Сохранить изменения";

  if(error){
    showToast("Не удалось сохранить изменения: " + error.message, "error");
    return;
  }

  showToast("Изменения сохранены", "success");
  window.location.href = "profile.html";
}


// ---------- Редактирование медицинской информации (client/edit-medical.html) ----------

async function initEditMedical(){

  const profile = await getProfile();

  if(!profile){
    window.location.href = "../login.html";
    return;
  }

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {data: clientProfile, error} = await supabaseClient
    .from("client_profiles")
    .select("contraindications, notes")
    .eq("user_id", user.id)
    .maybeSingle();

  if(error){
    console.log(error);
  }

  document.getElementById("contraindications").value =
    clientProfile ? (clientProfile.contraindications || "") : "";

  document.getElementById("notes").value =
    clientProfile ? (clientProfile.notes || "") : "";

  document.getElementById("saveMedicalBtn").addEventListener("click", saveMedical);
}


async function saveMedical(){

  const contraindications = document.getElementById("contraindications").value.trim();
  const notes = document.getElementById("notes").value.trim();

  const btn = document.getElementById("saveMedicalBtn");
  btn.disabled = true;
  btn.textContent = "Сохраняем...";

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {error} = await supabaseClient
    .from("client_profiles")
    .upsert({
      user_id: user.id,
      contraindications: contraindications || null,
      notes: notes || null
    }, {onConflict: "user_id"});

  btn.disabled = false;
  btn.textContent = "Сохранить изменения";

  if(error){
    showToast("Не удалось сохранить изменения: " + error.message, "error");
    return;
  }

  showToast("Изменения сохранены", "success");
  window.location.href = "profile.html";
}


// ---------- Удаление аккаунта ----------

async function deleteMyAccount(){

  const firstConfirm = await showConfirm(
    "Вы уверены, что хотите удалить аккаунт? " +
    "Доступ к аккаунту будет закрыт немедленно, а запрос на " +
    "удаление данных отправлен администратору."
  );

  if(!firstConfirm){
    return;
  }

  const secondConfirm = await showConfirm(
    "Это последнее предупреждение. После подтверждения вы не сможете " +
    "войти в аккаунт, пока администратор не обработает заявку. Продолжить?"
  );

  if(!secondConfirm){
    return;
  }

  const btn = document.getElementById("deleteAccountBtn");
  btn.disabled = true;
  btn.textContent = "Отправляем заявку...";

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {error} = await supabaseClient
    .from("profiles")
    .update({
      is_banned: true,
      ban_reason: "Запрос пользователя на удаление аккаунта",
      deletion_requested: true,
      deletion_requested_at: new Date().toISOString()
    })
    .eq("id", user.id);

  if(error){
    showToast("Не удалось отправить заявку на удаление: " + error.message, "error");
    btn.disabled = false;
    btn.textContent = "Удалить аккаунт";
    return;
  }

  await supabaseClient.auth.signOut();

  showToast(
    "Доступ к аккаунту закрыт. Заявка на удаление отправлена администратору.",
    "success"
  );

  setTimeout(() => {
    window.location.href = "../index.html";
  }, 1500);
}
