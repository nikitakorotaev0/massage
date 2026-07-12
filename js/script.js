console.log("Сайт Дракон Востока загружен");


const phoneInput = document.getElementById("phone");


if (phoneInput) {

  phoneInput.addEventListener("input", function () {


    let value = this.value.replace(/\D/g, "");


    if (value.startsWith("8")) {

      value = "7" + value.substring(1);

    }


    if (value.startsWith("9")) {

      value = "7" + value;

    }


    if (value.startsWith("7")) {

      value = "+" + value;

    }


    this.value = value.substring(0, 12);

  });

}