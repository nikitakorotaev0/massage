// =====================================
// Админ: статистика
// =====================================

async function initAdminStatistics(){

  const profile = await getProfile();

  if(!profile || profile.role !== "admin"){
    showToast("Доступ только для администраторов", "error");
    window.location.href = "../login.html";
    return;
  }

  await loadOverviewStats();
  await loadPopularServices();
  await loadEmployeeActivity();
}


function statsMonthStartIso(){
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}


async function loadOverviewStats(){

  const monthStart = statsMonthStartIso();

  const {count: clientsCount} = await supabaseClient
    .from("profiles")
    .select("id", {count: "exact", head: true})
    .eq("role", "client");

  document.getElementById("statClients").textContent = clientsCount ?? "—";

  const {count: appointmentsCount} = await supabaseClient
    .from("appointments")
    .select("id", {count: "exact", head: true})
    .gte("date", monthStart)
    .neq("status", "cancelled");

  document.getElementById("statAppointments").textContent = appointmentsCount ?? "—";

  const {data: completedAppointments, error} = await supabaseClient
    .from("appointments")
    .select("service_id")
    .gte("date", monthStart)
    .eq("status", "completed");

  if(error || !completedAppointments || completedAppointments.length === 0){
    document.getElementById("statRevenue").textContent = "0 ₽";
    return;
  }

  const serviceIds = [...new Set(completedAppointments.map(a => a.service_id).filter(Boolean))];

  const {data: serviceRows} = await supabaseClient
    .from("services")
    .select("id, price")
    .in("id", serviceIds);

  const priceById = {};
  (serviceRows || []).forEach(s => { priceById[s.id] = s.price; });

  const revenue = completedAppointments.reduce((sum, a) => sum + (priceById[a.service_id] || 0), 0);

  document.getElementById("statRevenue").textContent = `${revenue.toLocaleString("ru-RU")} ₽`;
}


async function loadPopularServices(){

  const container = document.getElementById("popularServicesContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("service_id")
    .eq("status", "completed");

  if(error){
    container.innerHTML = `<p>Не удалось загрузить статистику: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p>Данных пока недостаточно.</p>`;
    return;
  }

  const counts = {};
  data.forEach(a => {
    if(!a.service_id) return;
    counts[a.service_id] = (counts[a.service_id] || 0) + 1;
  });

  const serviceIds = Object.keys(counts);

  const {data: serviceRows} = await supabaseClient
    .from("services")
    .select("id, name")
    .in("id", serviceIds);

  const nameById = {};
  (serviceRows || []).forEach(s => { nameById[s.id] = s.name; });

  const ranked = serviceIds
    .map(id => ({id, name: nameById[id] || "Услуга", count: counts[id]}))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  container.innerHTML = "";

  ranked.forEach((item, index) => {
    const row = document.createElement("p");
    row.innerHTML = `<strong>${index + 1} место:</strong> ${item.name} — ${item.count} сеанс(ов)`;
    container.appendChild(row);
  });
}


async function loadEmployeeActivity(){

  const container = document.getElementById("employeeActivityContainer");
  container.innerHTML = `<p>Загрузка...</p>`;

  const {data, error} = await supabaseClient
    .from("appointments")
    .select("employee_id")
    .eq("status", "completed");

  if(error){
    container.innerHTML = `<p>Не удалось загрузить статистику: ${error.message}</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p>Данных пока недостаточно.</p>`;
    return;
  }

  const counts = {};
  data.forEach(a => {
    if(!a.employee_id) return;
    counts[a.employee_id] = (counts[a.employee_id] || 0) + 1;
  });

  const employeeIds = Object.keys(counts);

  const {data: profileRows} = await supabaseClient
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", employeeIds);

  const nameById = {};
  (profileRows || []).forEach(p => { nameById[p.id] = `${p.last_name} ${p.first_name}`; });

  const ranked = employeeIds
    .map(id => ({id, name: nameById[id] || "Сотрудник", count: counts[id]}))
    .sort((a, b) => b.count - a.count);

  container.innerHTML = "";

  ranked.forEach(item => {
    const row = document.createElement("p");
    row.innerHTML = `<strong>${item.name}:</strong> ${item.count} сеанс(ов)`;
    container.appendChild(row);
  });
}
