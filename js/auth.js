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






async function logout(){


await supabaseClient.auth.signOut();


window.location.href="../login.html";


}