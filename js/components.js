const path = window.location.pathname;


let root = "";


if (
  path.includes("/client/") ||
  path.includes("/employee/") ||
  path.includes("/admin/")
) {

  root = "../";

}






const header = document.getElementById("header");


if (header) {


header.innerHTML = `


<header class="header">


<div class="container">


<div class="logo">

Дзен

</div>



<nav class="nav">


<a href="${root}index.html">

Главная

</a>



<a href="${root}services.html">

Услуги

</a>



<a href="${root}about.html">

О салоне

</a>



<a href="${root}contacts.html">

Контакты

</a>



<span id="authNavSlot" style="display:flex; gap:16px;">

<a href="${root}login.html">

Вход

</a>

</span>



</nav>


</div>


</header>


`;


updateAuthNav();

}


async function updateAuthNav(){

  const slot = document.getElementById("authNavSlot");

  if(!slot){
    return;
  }

  if(typeof supabaseClient === "undefined" || typeof getProfile !== "function"){
    return;
  }

  const profile = await getProfile();

  if(!profile){
    slot.innerHTML = `<a href="${root}login.html">Вход</a>`;
    return;
  }

  let dashboardUrl = `${root}client/dashboard.html`;

  if(profile.role === "employee"){
    dashboardUrl = `${root}employee/dashboard.html`;
  }else if(profile.role === "admin"){
    dashboardUrl = `${root}admin/dashboard.html`;
  }

  slot.innerHTML = `<a href="${dashboardUrl}">Личный кабинет</a>`;
}






const footer = document.getElementById("footer");


if (footer) {


footer.innerHTML = `


<footer class="footer">


<div class="container">



<div class="footer-content">



<div>

<h3>
Дзен
</h3>


<p>
Салон массажа для восстановления баланса тела и разума.
</p>


</div>






<div>


<h3>
Контакты
</h3>


<p id="footerPhone">
+7 (900) 000-00-00
</p>


<p id="footerHours">
Пн–Сб: 10:00–20:00
</p>


</div>






<div>


<h3>
Навигация
</h3>


<p>

<a href="${root}services.html">

Услуги

</a>

</p>




<p>

<a href="${root}contacts.html">

Контакты

</a>

</p>


</div>



</div>




<div class="footer-bottom">


© 2026 Дзен


</div>



</div>


</footer>


`;

updateFooterContacts();

}


const WEEKDAY_ABBR = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatWorkDays(workDaysStr){

  if(!workDaysStr){
    return "Ежедневно";
  }

  const days = workDaysStr.split(",").map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 7).sort((a, b) => a - b);

  if(days.length === 0){
    return "Ежедневно";
  }

  let contiguous = true;
  for(let i = 1; i < days.length; i++){
    if(days[i] !== days[i - 1] + 1){
      contiguous = false;
      break;
    }
  }

  if(contiguous && days.length > 1){
    return `${WEEKDAY_ABBR[days[0]]}–${WEEKDAY_ABBR[days[days.length - 1]]}`;
  }

  return days.map(d => WEEKDAY_ABBR[d]).join(", ");
}


async function fetchSalonSettings(){

  if(typeof supabaseClient === "undefined"){
    return {};
  }

  const {data, error} = await supabaseClient
    .from("settings")
    .select("key, value");

  if(error || !data){
    return {};
  }

  const map = {};
  data.forEach(row => { map[row.key] = row.value; });
  return map;
}


async function updateFooterContacts(){

  const phoneEl = document.getElementById("footerPhone");
  const hoursEl = document.getElementById("footerHours");

  if(!phoneEl || !hoursEl){
    return;
  }

  const settings = await fetchSalonSettings();

  if(settings.contact_phone){
    phoneEl.textContent = settings.contact_phone;
  }

  if(settings.work_start && settings.work_end){
    hoursEl.textContent = `${formatWorkDays(settings.work_days)}: ${settings.work_start.slice(0,5)}–${settings.work_end.slice(0,5)}`;
  }
}


// Лёгкая тень у шапки при прокрутке — ощущение "нативности" интерфейса
(function(){
  const headerEl = document.querySelector(".header");
  if(!headerEl) return;

  function updateHeaderShadow(){
    if(window.scrollY > 6){
      headerEl.classList.add("is-scrolled");
    }else{
      headerEl.classList.remove("is-scrolled");
    }
  }

  window.addEventListener("scroll", updateHeaderShadow, {passive: true});
  updateHeaderShadow();
})();
