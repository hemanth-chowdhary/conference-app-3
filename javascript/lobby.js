let form = document.getElementById("lobby__form");
let isHostCheckbox = document.getElementById("is_host_true");

let displayName = sessionStorage.getItem("display_name");
if (displayName) {
  form.name.value = displayName;
}

// take user to the room if everything is set up i.e, a name and room id is entered
// set the required session storage variables like display_name, is_host, has_joined
form.addEventListener("submit", (e) => {
  e.preventDefault();

  sessionStorage.setItem("display_name", e.target.name.value);
  if (isHostCheckbox.checked) {
    sessionStorage.setItem("is_host", "true");
  } else {
    sessionStorage.setItem("is_host", "false");
  }

  sessionStorage.setItem("has_joined", false);

  let inviteCode = e.target.room.value;
  if (!inviteCode) {
    inviteCode = String(Math.floor(Math.random() * 10000));
  }
  sessionStorage.setItem('roomId', inviteCode);
  window.location = `calibration.html?room=${inviteCode}`;
});
