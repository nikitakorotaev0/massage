async function register() {


const firstName =
document.getElementById("firstName").value;


const lastName =
document.getElementById("lastName").value;


const phone =
document.getElementById("phone").value;


const email =
document.getElementById("email").value;


const password =
document.getElementById("password").value;



if(
!firstName ||
!lastName ||
!phone ||
!email ||
!password
){

alert("Заполните все поля");

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

alert(profileError.message);

return;

}





const {error: clientError} =
await supabaseClient
.from("client_profiles")
.insert({

user_id:user.id

});





if(clientError){

alert(clientError.message);

return;

}





alert(
"Регистрация успешна! Проверьте почту."
);



window.location.href="login.html";


}