// =====================================
// Админ: управление услугами
// =====================================

let allServicesCache = [];


async function initAdminServices(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  document.getElementById("createServiceBtn").addEventListener("click", createService);

  await loadServicesList();
}


async function loadServicesList(){

  const container = document.getElementById("servicesListContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data, error} = await supabaseClient
    .from("services")
    .select("id, name, description, duration_minutes, price, is_active")
    .order("name");

  if(error){
    container.innerHTML = `<p>Не удалось загрузить услуги: ${error.message}</p>`;
    return;
  }

  allServicesCache = data || [];

  if(allServicesCache.length === 0){
    container.innerHTML = `<p>Услуг пока нет.</p>`;
    return;
  }

  container.innerHTML = "";

  allServicesCache.forEach((service, index) => {
    const card = renderServiceCard(service);
    if(index > 0){
      card.style.marginTop = "20px";
    }
    container.appendChild(card);
  });
}


const SERVICE_TYPE_LABELS = {
  primary: "Основная",
  additional: "Дополнительная",
  mixed: "Смешанная"
};


function renderServiceCard(service){

  const card = document.createElement("div");
  card.className = "card";
  card.id = `service-card-${service.id}`;

  card.innerHTML = `
    <h2>${service.name}</h2>
    <p>${service.description || ""}</p>
    <p><strong>Продолжительность:</strong><br>${service.duration_minutes} минут</p>
    <p><strong>Цена:</strong><br>${service.price} ₽</p>
    <p><strong>Тип:</strong><br>${SERVICE_TYPE_LABELS[service.service_type] || "Смешанная"}</p>
    <p><strong>Статус:</strong><br>${service.is_active ? "Активна" : "Не активна"}</p>
  `;

  const editBtn = document.createElement("button");
  editBtn.className = "btn";
  editBtn.type = "button";
  editBtn.style.marginTop = "10px";
  editBtn.textContent = "Изменить";
  editBtn.addEventListener("click", () => toggleEditForm(service));

  const toggleBtn = document.createElement("button");
  toggleBtn.className = service.is_active ? "btn btn-danger" : "btn";
  toggleBtn.type = "button";
  toggleBtn.style.marginTop = "10px";
  toggleBtn.style.marginLeft = "10px";
  toggleBtn.textContent = service.is_active ? "Деактивировать" : "Активировать";
  toggleBtn.addEventListener("click", () => toggleServiceActive(service));

  card.appendChild(editBtn);
  card.appendChild(toggleBtn);

  const formBox = document.createElement("div");
  formBox.id = `service-edit-${service.id}`;
  formBox.style.display = "none";
  formBox.style.marginTop = "15px";
  card.appendChild(formBox);

  return card;
}


function serviceTypeRadios(namePrefix, currentType){

  const type = currentType || "mixed";

  return `
    <label style="font-weight:normal;">
    <input type="radio" name="${namePrefix}" value="primary" ${type === "primary" ? "checked" : ""}>
    Основная (можно выбрать только первой)
    </label>

    <label style="font-weight:normal;">
    <input type="radio" name="${namePrefix}" value="additional" ${type === "additional" ? "checked" : ""}>
    Дополнительная (можно выбрать только как дополнение)
    </label>

    <label style="font-weight:normal;">
    <input type="radio" name="${namePrefix}" value="mixed" ${type === "mixed" ? "checked" : ""}>
    Смешанная (подходит и как основная, и как дополнительная)
    </label>
  `;
}


function toggleEditForm(service){

  const box = document.getElementById(`service-edit-${service.id}`);

  if(box.style.display === "block"){
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  box.style.display = "block";
  box.innerHTML = `
    <form onsubmit="return false;">
      <label>Название</label>
      <input type="text" id="edit-name-${service.id}" value="${service.name}">

      <label style="margin-top:10px;">Описание</label>
      <textarea id="edit-desc-${service.id}" rows="3">${service.description || ""}</textarea>

      <label style="margin-top:10px;">Продолжительность (мин)</label>
      <input type="number" id="edit-duration-${service.id}" value="${service.duration_minutes}">

      <label style="margin-top:10px;">Цена (₽)</label>
      <input type="number" id="edit-price-${service.id}" value="${service.price}">

      <label style="margin-top:10px;">Тип услуги</label>
      <div id="edit-type-${service.id}">
      ${serviceTypeRadios(`edit-type-radio-${service.id}`, service.service_type)}
      </div>
    </form>

    <button class="btn" type="button" id="edit-save-${service.id}" style="margin-top:15px;">
    Сохранить изменения
    </button>
  `;

  document.getElementById(`edit-save-${service.id}`).addEventListener("click", () => saveServiceEdit(service.id));
}


async function saveServiceEdit(serviceId){

  const name = document.getElementById(`edit-name-${serviceId}`).value.trim();
  const description = document.getElementById(`edit-desc-${serviceId}`).value.trim();
  const duration = parseInt(document.getElementById(`edit-duration-${serviceId}`).value, 10);
  const price = parseFloat(document.getElementById(`edit-price-${serviceId}`).value);

  const typeInput = document.querySelector(`input[name="edit-type-radio-${serviceId}"]:checked`);
  const serviceType = typeInput ? typeInput.value : "mixed";

  if(!name || !duration || !price){
    showToast("Заполните название, продолжительность и цену", "error");
    return;
  }

  const {error} = await supabaseClient
    .from("services")
    .update({
      name: name,
      description: description || null,
      duration_minutes: duration,
      price: price,
      service_type: serviceType
    })
    .eq("id", serviceId);

  if(error){
    showToast("Не удалось сохранить изменения: " + error.message, "error");
    return;
  }

  showToast("Услуга обновлена", "success");
  await loadServicesList();
}


async function toggleServiceActive(service){

  const {error} = await supabaseClient
    .from("services")
    .update({is_active: !service.is_active})
    .eq("id", service.id);

  if(error){
    showToast("Не удалось изменить статус: " + error.message, "error");
    return;
  }

  showToast(service.is_active ? "Услуга деактивирована" : "Услуга активирована", "success");
  await loadServicesList();
}


async function createService(){

  const name = document.getElementById("newServiceName").value.trim();
  const description = document.getElementById("newServiceDesc").value.trim();
  const duration = parseInt(document.getElementById("newServiceDuration").value, 10);
  const price = parseFloat(document.getElementById("newServicePrice").value);

  const typeInput = document.querySelector('input[name="newServiceType"]:checked');
  const serviceType = typeInput ? typeInput.value : "mixed";

  if(!name || !duration || !price){
    showToast("Заполните название, продолжительность и цену", "error");
    return;
  }

  const btn = document.getElementById("createServiceBtn");
  btn.disabled = true;
  btn.textContent = "Создаём...";

  const {error} = await supabaseClient
    .from("services")
    .insert({
      name: name,
      description: description || null,
      duration_minutes: duration,
      price: price,
      service_type: serviceType,
      is_active: true
    });

  btn.disabled = false;
  btn.textContent = "Создать услугу";

  if(error){
    showToast("Не удалось создать услугу: " + error.message, "error");
    return;
  }

  showToast("Услуга создана", "success");

  document.getElementById("newServiceName").value = "";
  document.getElementById("newServiceDesc").value = "";
  document.getElementById("newServiceDuration").value = "";
  document.getElementById("newServicePrice").value = "";
  document.querySelector('input[name="newServiceType"][value="mixed"]').checked = true;

  await loadServicesList();
}
