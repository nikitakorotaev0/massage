// =====================================
// Админ: управление промокодами
// =====================================

let promoServicesCache = [];


async function initAdminPromo(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  await loadPromoServicesForSelect();

  document.querySelectorAll('input[name="promoType"]').forEach(el => {
    el.addEventListener("change", togglePromoTypeFields);
  });

  document.querySelectorAll('input[name="promoLimit"]').forEach(el => {
    el.addEventListener("change", togglePromoLimitFields);
  });

  document.querySelectorAll('input[name="promoTime"]').forEach(el => {
    el.addEventListener("change", togglePromoTimeFields);
  });

  togglePromoTypeFields();
  togglePromoLimitFields();
  togglePromoTimeFields();

  document.getElementById("createPromoBtn").addEventListener("click", createPromo);

  await loadPromoList();
}


async function loadPromoServicesForSelect(){

  const {data, error} = await supabaseClient
    .from("services")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if(error){
    return;
  }

  promoServicesCache = data || [];

  const select = document.getElementById("promoFreeService");
  select.innerHTML = "";

  promoServicesCache.forEach(s => {
    const option = document.createElement("option");
    option.value = s.id;
    option.textContent = s.name;
    select.appendChild(option);
  });
}


function togglePromoTypeFields(){
  const isFreeService = document.getElementById("promoTypeFreeService").checked;
  document.getElementById("promoFreeServiceBox").style.display = isFreeService ? "block" : "none";
  document.getElementById("promoDiscountBox").style.display = isFreeService ? "none" : "block";
}

function togglePromoLimitFields(){
  const isLimited = document.getElementById("promoLimitLimited").checked;
  document.getElementById("promoUsesLeftBox").style.display = isLimited ? "block" : "none";
}

function togglePromoTimeFields(){
  const isPeriod = document.getElementById("promoTimePeriod").checked;
  document.getElementById("promoPeriodBox").style.display = isPeriod ? "block" : "none";
}


async function createPromo(){

  const code = document.getElementById("promoCode").value.trim().toUpperCase();

  if(!code){
    showToast("Укажите код промокода", "error");
    return;
  }

  const isFreeService = document.getElementById("promoTypeFreeService").checked;

  let discount = null;
  let freeServiceId = null;

  if(isFreeService){
    freeServiceId = document.getElementById("promoFreeService").value;
    if(!freeServiceId){
      showToast("Выберите бесплатную услугу", "error");
      return;
    }
  }else{
    discount = parseInt(document.getElementById("promoDiscount").value, 10);
    if(!discount || discount <= 0 || discount > 100){
      showToast("Укажите корректный процент скидки (1–100)", "error");
      return;
    }
  }

  const isLimited = document.getElementById("promoLimitLimited").checked;
  let usesLeft = null;

  if(isLimited){
    usesLeft = parseInt(document.getElementById("promoUsesLeft").value, 10);
    if(!usesLeft || usesLeft <= 0){
      showToast("Укажите количество использований", "error");
      return;
    }
  }

  const isPeriod = document.getElementById("promoTimePeriod").checked;
  let startsAt = null;
  let expiresAt = null;

  if(isPeriod){
    startsAt = document.getElementById("promoStartsAt").value || null;
    expiresAt = document.getElementById("promoExpiresAt").value || null;

    if(!startsAt || !expiresAt){
      showToast("Укажите обе даты периода действия", "error");
      return;
    }

    if(startsAt > expiresAt){
      showToast("Дата начала не может быть позже даты окончания", "error");
      return;
    }
  }

  const btn = document.getElementById("createPromoBtn");
  btn.disabled = true;
  btn.textContent = "Создаём...";

  const {error} = await supabaseClient
    .from("promo_codes")
    .insert({
      code: code,
      discount: discount,
      free_service_id: freeServiceId,
      uses_left: usesLeft,
      starts_at: startsAt,
      expires_at: expiresAt,
      active: true
    });

  btn.disabled = false;
  btn.textContent = "Создать промокод";

  if(error){
    if(error.code === "23505"){
      showToast("Промокод с таким кодом уже существует", "error");
    }else{
      showToast("Не удалось создать промокод: " + error.message, "error");
    }
    return;
  }

  showToast("Промокод создан", "success");

  document.getElementById("promoCode").value = "";
  document.getElementById("promoDiscount").value = "";
  document.getElementById("promoUsesLeft").value = "";
  document.getElementById("promoStartsAt").value = "";
  document.getElementById("promoExpiresAt").value = "";

  await loadPromoList();
}


function promoStatusLabel(promo){

  const today = new Date().toISOString().slice(0, 10);

  if(!promo.active){
    return "Отключён";
  }
  if(promo.uses_left !== null && promo.uses_left <= 0){
    return "Исчерпан";
  }
  if(promo.expires_at && promo.expires_at < today){
    return "Истёк";
  }
  if(promo.starts_at && promo.starts_at > today){
    return "Ещё не начал действовать";
  }
  return "Активен";
}


async function loadPromoList(){

  const container = document.getElementById("promoListContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data, error} = await supabaseClient
    .from("promo_codes")
    .select("id, code, discount, free_service_id, uses_left, starts_at, expires_at, active")
    .order("id", {ascending: false});

  if(error){
    container.innerHTML = `<p>Не удалось загрузить промокоды: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p>Промокодов пока нет.</p>`;
    return;
  }

  const serviceIds = [...new Set(data.map(p => p.free_service_id).filter(Boolean))];
  let servicesById = {};

  if(serviceIds.length > 0){
    const {data: serviceRows} = await supabaseClient
      .from("services")
      .select("id, name")
      .in("id", serviceIds);
    (serviceRows || []).forEach(s => { servicesById[s.id] = s; });
  }

  container.innerHTML = "";

  data.forEach((promo, index) => {

    const card = document.createElement("div");
    card.className = "card";
    if(index > 0){
      card.style.marginTop = "20px";
    }

    const rewardText = promo.free_service_id
      ? `Бесплатная услуга: ${servicesById[promo.free_service_id] ? servicesById[promo.free_service_id].name : "Услуга"}`
      : `Скидка: ${promo.discount}%`;

    const usesText = promo.uses_left === null ? "Неограничено" : `${promo.uses_left}`;
    const periodText = (promo.starts_at || promo.expires_at)
      ? `${promo.starts_at ? promo.starts_at.split("-").reverse().join(".") : "…"} – ${promo.expires_at ? promo.expires_at.split("-").reverse().join(".") : "…"}`
      : "Бессрочно";

    card.innerHTML = `
      <h2>${promo.code}</h2>
      <p><strong>${rewardText}</strong></p>
      <p><strong>Использований осталось:</strong><br>${usesText}</p>
      <p><strong>Период действия:</strong><br>${periodText}</p>
      <p><strong>Статус:</strong><br>${promoStatusLabel(promo)}</p>
    `;

    const toggleBtn = document.createElement("button");
    toggleBtn.className = promo.active ? "btn btn-danger" : "btn";
    toggleBtn.type = "button";
    toggleBtn.style.marginTop = "10px";
    toggleBtn.textContent = promo.active ? "Отключить" : "Включить";
    toggleBtn.addEventListener("click", () => togglePromoActive(promo));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.type = "button";
    deleteBtn.style.marginTop = "10px";
    deleteBtn.style.marginLeft = "10px";
    deleteBtn.textContent = "Удалить из истории";
    deleteBtn.addEventListener("click", () => deletePromo(promo.id));

    card.appendChild(toggleBtn);
    card.appendChild(deleteBtn);
    container.appendChild(card);
  });
}


async function togglePromoActive(promo){

  const {error} = await supabaseClient
    .from("promo_codes")
    .update({active: !promo.active})
    .eq("id", promo.id);

  if(error){
    showToast("Не удалось изменить статус: " + error.message, "error");
    return;
  }

  showToast(promo.active ? "Промокод отключён" : "Промокод включён", "success");
  await loadPromoList();
}


async function deletePromo(promoId){

  const confirmed = await showConfirm("Удалить промокод из истории? Действие необратимо.");
  if(!confirmed){
    return;
  }

  const {error} = await supabaseClient
    .from("promo_codes")
    .delete()
    .eq("id", promoId);

  if(error){
    showToast("Не удалось удалить промокод: " + error.message, "error");
    return;
  }

  showToast("Промокод удалён", "success");
  await loadPromoList();
}
