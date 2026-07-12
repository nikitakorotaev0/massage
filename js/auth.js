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