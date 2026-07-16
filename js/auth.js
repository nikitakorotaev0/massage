// =====================================
// Служебное: определение корневого пути страницы
// (нужно, чтобы редиректы вроде logout() корректно работали
// как из корня сайта, так и из /client/, /employee/, /admin/)
// =====================================

function getRootPath(){

  const path = window.location.pathname;

  if(
    path.includes("/client/") ||
    path.includes("/employee/") ||
    path.includes("/admin/")
  ){
    return "../";
  }

  return "";
}


// Специальный логин администратора: вместо реального email
// в форме входа можно ввести "admin" — он смэпится на
// служебный email учётной записи администратора в Supabase Auth.
const ADMIN_LOGIN_ALIAS = "admin";
const ADMIN_LOGIN_EMAIL = "admin@dzen.local";


// =====================================
// Авторизация пользователя
// =====================================


async function login(){


const emailInput =
document.getElementById("email").value.trim();


const password =
document.getElementById("password").value;




if(!emailInput || !password){

showToast("Введите email и пароль", "error");

return;

}


const email =
emailInput.toLowerCase() === ADMIN_LOGIN_ALIAS ? ADMIN_LOGIN_EMAIL : emailInput;




const {data, error} =
await supabaseClient.auth.signInWithPassword({

email: email,

password: password

});




if(error){

showToast(error.message, "error");

return;

}




const user = data.user;



const {data: profile, error: profileError} =
await supabaseClient
.from("profiles")
.select("*")
.eq("id", user.id)
.single();




if(profileError){

showToast("Профиль пользователя не найден", "error");

return;

}




if(profile.is_banned){

showToast("Ваш аккаунт заблокирован. Обратитесь к администрации салона.", "error");

await supabaseClient.auth.signOut();

return;

}




if(profile.role === "admin"){


window.location.href="admin/dashboard.html";


}

else if(profile.role === "employee"){


window.location.href="employee/dashboard.html";


}

else{


window.location.href="client/dashboard.html";


}



}



// =====================================
// Регистрация нового клиента
// =====================================

async function register(){


const firstName =
document.getElementById("firstName").value.trim();

const lastName =
document.getElementById("lastName").value.trim();

const phone =
document.getElementById("phone").value.trim();

const email =
document.getElementById("email").value.trim();

const password =
document.getElementById("password").value;


if(!firstName || !lastName || !phone || !email || !password){

showToast("Заполните все поля", "error");

return;

}


if(password.length < 6){

showToast("Пароль должен содержать не менее 6 символов", "error");

return;

}


const {data, error} =
await supabaseClient.auth.signUp({

email: email,

password: password

});


if(error){

showToast(error.message, "error");

return;

}


const user = data.user;


if(!user){

showToast("Не удалось создать пользователя. Попробуйте ещё раз.", "error");

return;

}


const {error: profileError} =
await supabaseClient
.from("profiles")
.update({

first_name: firstName,

last_name: lastName,

phone: phone,

email: email,

role: "client"

})
.eq("id", user.id);


if(profileError){

showToast("Аккаунт создан, но не удалось сохранить профиль: " + profileError.message, "error");

return;

}


if(data.session){

showToast("Регистрация прошла успешно!", "success");

window.location.href="client/dashboard.html";

}

else{

showToast("Регистрация прошла успешно. Проверьте почту для подтверждения email, затем войдите.", "success");

window.location.href="login.html";

}


}




async function logout(){


await supabaseClient.auth.signOut();


window.location.href = getRootPath() + "login.html";


}

async function getProfile(){


const {data:{user}} =
await supabaseClient.auth.getUser();



if(!user){

return null;

}



const {data, error} =
await supabaseClient
.from("profiles")
.select("*")
.eq("id", user.id)
.single();



if(error){

console.log(error);

return null;

}



return data;


}
