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

Дракон Востока

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



<a href="${root}login.html">

Выход

</a>



</nav>


</div>


</header>


`;

}





const footer = document.getElementById("footer");


if (footer) {


footer.innerHTML = `


<footer class="footer">


<div class="container">



<div class="footer-content">



<div>

<h3>
Дракон Востока
</h3>


<p>
Массажный салон восточных практик.
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


© 2026 Дракон Востока


</div>



</div>


</footer>


`;

}