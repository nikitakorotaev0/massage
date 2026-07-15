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


<p>
+7 (900) 000-00-00
</p>


<p>
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

}
