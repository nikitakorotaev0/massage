// =====================================
// Мои записи (предстоящие) и история посещений
// =====================================

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

const STATUS_LABELS = {
  booked: "Подтверждено",
  completed: "Завершено",
  cancelled: "Отменено",
  no_show: "Не пришёл"
};


function formatDateRu(dateStr){
  const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
  return `${d} ${MONTHS_RU[m - 1]} ${y}`;
}

function formatTimeShort(timeStr){
  return timeStr.slice(0, 5);
}

function todayDateString(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function statusLabel(status){
  return STATUS_LABELS[status] || status;
}


// Подгружает связанные названия услуг и имена мастеров для списка записей
async function attachServiceAndEmployeeNames(appointments){

  const serviceIds = [...new Set(appointments.map(a => a.service_id).filter(Boolean))];
  const employeeIds = [...new Set(appointments.map(a => a.employee_id).filter(Boolean))];

  let servicesById = {};
  let profilesById = {};

  if(serviceIds.length > 0){
    const {data} = await supabaseClient
      .from("services")
      .select("id, name")
      .in("id", serviceIds);

    (data || []).forEach(s => { servicesById[s.id] = s; });
  }

  if(employeeIds.length > 0){
    const {data} = await supabaseClient
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", employeeIds);

    (data || []).forEach(p => { profilesById[p.id] = p; });
  }

  appointments.forEach(a => {
    a.service_name = servicesById[a.service_id] ? servicesById[a.service_id].name : "Услуга";
    const emp = profilesById[a.employee_id];
    a.employee_name = emp ? `${emp.first_name} ${emp.last_name}` : "Мастер";
  });

  return appointments;
}


// ---------- Виджет "Ближайшая запись" на дашборде ----------

async function initNearestAppointmentWidget(){

  const container = document.getElementById("nearestAppointmentContent");
  if(!container) return;

  const {data: {user}} = await supabaseClient.auth.getUser();

  if(!user){
    return;
  }

  const today = todayDateString();

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("id, service_id, employee_id, date, start_time, end_time, status")
    .eq("client_id", user.id)
    .neq("status", "cancelled")
    .gte("date", today)
    .order("date", {ascending: true})
    .order("start_time", {ascending: true})
    .limit(1);

  if(error || !data || data.length === 0){
    return;
  }

  await attachServiceAndEmployeeNames(data);

  const appointment = data[0];

  container.innerHTML = `
    <p>
      <strong>${formatDateRu(appointment.date)}</strong>,
      ${formatTimeShort(appointment.start_time)}
      — ${appointment.service_name} у мастера ${appointment.employee_name}
    </p>

    <a class="btn" href="appointments.html">
    Подробнее
    </a>
  `;
}


// ---------- Предстоящие записи ----------

async function initUpcomingAppointments(){

  const profile = await getProfile();

  if(!profile){
    window.location.href = "../login.html";
    return;
  }

  await renderUpcomingAppointments();
}


async function renderUpcomingAppointments(){

  const container = document.getElementById("appointmentsContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data: {user}} = await supabaseClient.auth.getUser();

  const today = todayDateString();

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("id, service_id, employee_id, date, start_time, end_time, status, booked_for_name")
    .eq("client_id", user.id)
    .neq("status", "cancelled")
    .gte("date", today)
    .order("date", {ascending: true})
    .order("start_time", {ascending: true});

  if(error){
    container.innerHTML = `<div class="card"><p>Не удалось загрузить записи: ${error.message}</p></div>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<div class="card"><p>У вас пока нет предстоящих записей.</p></div>`;
    return;
  }

  await attachServiceAndEmployeeNames(data);

  container.innerHTML = "";

  data.forEach((appointment, index) => {

    const card = document.createElement("div");
    card.className = "card";
    if(index > 0){
      card.style.marginTop = "30px";
    }

    card.innerHTML = `
      <h2>${index === 0 ? "Ближайшая запись" : "Предстоящая запись"}</h2>

      <p><strong>Дата:</strong><br>${formatDateRu(appointment.date)}</p>

      <p><strong>Время:</strong><br>${formatTimeShort(appointment.start_time)} — ${formatTimeShort(appointment.end_time)}</p>

      <p><strong>Услуга:</strong><br>${appointment.service_name}</p>

      <p><strong>Мастер:</strong><br>${appointment.employee_name}</p>

      <p><strong>Записан(а):</strong><br>${appointment.booked_for_name}</p>

      <p><strong>Статус:</strong><br><span>${statusLabel(appointment.status)}</span></p>
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn";
    cancelBtn.textContent = "Отменить запись";
    cancelBtn.addEventListener("click", () => cancelAppointment(appointment.id));

    card.appendChild(cancelBtn);
    container.appendChild(card);
  });
}


async function cancelAppointment(appointmentId){

  const confirmed = confirm("Отменить эту запись?");
  if(!confirmed){
    return;
  }

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {error} = await supabaseClient
    .from("appointments")
    .update({status: "cancelled"})
    .eq("id", appointmentId)
    .eq("client_id", user.id);

  if(error){
    alert("Не удалось отменить запись: " + error.message);
    return;
  }

  await renderUpcomingAppointments();
}


// ---------- История посещений ----------

async function initHistory(){

  const profile = await getProfile();

  if(!profile){
    window.location.href = "../login.html";
    return;
  }

  await renderHistory();
}


async function renderHistory(){

  const container = document.getElementById("historyContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data: {user}} = await supabaseClient.auth.getUser();

  const today = todayDateString();

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("id, service_id, employee_id, date, start_time, status")
    .eq("client_id", user.id)
    .neq("status", "cancelled")
    .lt("date", today)
    .order("date", {ascending: false})
    .order("start_time", {ascending: false});

  if(error){
    container.innerHTML = `<div class="card"><p>Не удалось загрузить историю: ${error.message}</p></div>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<div class="card"><p>После завершения новых процедур они появятся здесь.</p></div>`;
    return;
  }

  await attachServiceAndEmployeeNames(data);

  const appointmentIds = data.map(a => a.id);

  const {data: reviewRows, error: reviewError} = await supabaseClient
    .from("reviews")
    .select("id, appointment_id, rating, comment")
    .in("appointment_id", appointmentIds);

  if(reviewError){
    console.log(reviewError);
  }

  const reviewsByAppointment = {};
  (reviewRows || []).forEach(r => { reviewsByAppointment[r.appointment_id] = r; });

  container.innerHTML = "";

  data.forEach((appointment, index) => {

    const card = document.createElement("div");
    card.className = "card";
    if(index > 0){
      card.style.marginTop = "30px";
    }

    card.innerHTML = `
      <h2>${appointment.service_name}</h2>

      <p><strong>Дата:</strong><br>${formatDateRu(appointment.date)}</p>

      <p><strong>Мастер:</strong><br>${appointment.employee_name}</p>

      <p><strong>Статус:</strong><br>${statusLabel(appointment.status)}</p>
    `;

    const review = reviewsByAppointment[appointment.id];

    const reviewBlock = document.createElement("div");
    reviewBlock.style.marginTop = "15px";

    if(review){

      reviewBlock.innerHTML = `
        <p><strong>Ваша оценка:</strong><br>${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</p>
        ${review.comment ? `<p><strong>Комментарий:</strong><br>${review.comment}</p>` : ""}
      `;

    }else{

      const ratingSelect = document.createElement("select");
      ratingSelect.id = `rating-${appointment.id}`;
      [5, 4, 3, 2, 1].forEach(n => {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = "★".repeat(n) + "☆".repeat(5 - n);
        ratingSelect.appendChild(opt);
      });

      const commentInput = document.createElement("textarea");
      commentInput.id = `comment-${appointment.id}`;
      commentInput.rows = 3;
      commentInput.placeholder = "Расскажите о своих впечатлениях (необязательно)";
      commentInput.style.width = "100%";
      commentInput.style.marginTop = "8px";

      const submitBtn = document.createElement("button");
      submitBtn.className = "btn";
      submitBtn.type = "button";
      submitBtn.textContent = "Оставить отзыв";
      submitBtn.style.marginTop = "8px";
      submitBtn.addEventListener("click", () => leaveReview(appointment.id, ratingSelect.value, commentInput.value.trim()));

      const label = document.createElement("p");
      label.innerHTML = "<strong>Оценить визит:</strong>";

      reviewBlock.appendChild(label);
      reviewBlock.appendChild(ratingSelect);
      reviewBlock.appendChild(commentInput);
      reviewBlock.appendChild(submitBtn);
    }

    card.appendChild(reviewBlock);
    container.appendChild(card);
  });
}


async function leaveReview(appointmentId, rating, comment){

  const {data: {user}} = await supabaseClient.auth.getUser();

  const {error} = await supabaseClient
    .from("reviews")
    .insert({
      appointment_id: appointmentId,
      client_id: user.id,
      rating: parseInt(rating, 10),
      comment: comment || null
    });

  if(error){
    alert("Не удалось сохранить отзыв: " + error.message);
    return;
  }

  await renderHistory();
}
