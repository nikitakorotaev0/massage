// =====================================
// Авторизация пользователя
// =====================================


async function login(){


const email =
document.getElementById("email").value;


const password =
document.getElementById("password").value;




if(!email || !password){

alert("Введите email и пароль");

return;

}




const {data, error} =
await supabaseClient.auth.signInWithPassword({

email: email,

password: password

});




if(error){

alert(error.message);

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

alert("Профиль пользователя не найден");

return;

}




if(profile.is_banned){

alert("Ваш аккаунт заблокирован. Обратитесь к администрации салона.");

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

alert("Заполните все поля");

return;

}


if(password.length < 6){

alert("Пароль должен содержать не менее 6 символов");

return;

}


const {data, error} =
await supabaseClient.auth.signUp({

email: email,

password: password

});


if(error){

alert(error.message);

return;

}


const user = data.user;


if(!user){

alert("Не удалось создать пользователя. Попробуйте ещё раз.");

return;

}


const {error: profileError} =
await supabaseClient
.from("profiles")
.insert({

id: user.id,

first_name: firstName,

last_name: lastName,

phone: phone,

email: email,

role: "client"

});


if(profileError){

alert("Аккаунт создан, но не удалось сохранить профиль: " + profileError.message);

return;

}


if(data.session){

window.location.href="client/dashboard.html";

}

else{

alert("Регистрация прошла успешно. Проверьте почту для подтверждения email, затем войдите.");

window.location.href="login.html";

}


}




async function logout(){


await supabaseClient.auth.signOut();


window.location.href="../login.html";


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
