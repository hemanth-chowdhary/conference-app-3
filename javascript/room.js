const APP_ID = "af633987e6be495aafe799b3d6daca51";
// room.html?room=${inviteCode}
// the 4 variables below are set by the agora server for use in conferencing
let token = null;
let client;
let rtmClient;
let channel;

//manual uid generation, so we have more control over the users
let uid = sessionStorage.getItem("uid");
if (!uid) {
  uid = String(Math.floor(Math.random() * 10000));
  sessionStorage.setItem("uid", uid);
}

//check if the user is the host, to be used when host leaves the meet
let hostUID = null;
let hostMarked = false;
const isHost = sessionStorage.getItem("is_host") == "true";
if (isHost) {
  console.log(`I am the host ${isHost}`);
  hostUID = uid;
}


//userName is retreived from lobby form for name label
let userName = sessionStorage.getItem("display_name");
if (!userName) {
  window.location = "index.html";
}
/*
The groups object is a dictionary of user IDs to arrays of user IDs
Each array represents a group of users that are focusing on each other
sample structure:
  { 
    "user1": ["user1", "user2", "user3"], 
    "user2": ["user1", "user2", "user3"], 
    "user3": ["user1", "user2", "user3"],
    "user4": ["user4"]
    "user5": ["user5", "user6"],
    "user6": ["user5", "user6"]
  }
  the above structure means that users 1, 2 and 3 are focusing on each other
  user 4 has not focused on to anyone
  users 5 and 6 are focusing on each other
*/
let groups = {};
let groupSymbols = ['🅰', '🅱', '🅲', '🅳', '🅴', '🅵', '🅶', '🅷', '🅸', '🅹', '🅺', '🅻', '🅼', '🅽', '🅾', '🅿', '🆀', '🆁', '🆂', '🆃', '🆄', '🆅', '🆆', '🆇', '🆈', '🆉'];

//users is a dictionary of user IDs to user objects
//each user object consists of their uid and name
let users = {
  [uid]: {
    id: uid,
    name: userName,
  },
};

//retrieve the room ID from the URL
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get("room");

if (!roomId) {
  roomId = "main";
}

//localTracks is an array of the local user's media tracks
//remoteUsers is a dictionary of user IDs to user objects consisting of their media tracks
let localTracks = [];
let remoteUsers = {};

// joinStream is called when the user presses the join call button
// the user's audio and video tracks are published and they have fully joined to the room
// everyone else is notified about their joining,
// they get a copy of the users and groups objects in response to the user_joined message
// they are visible to everyone else in the room and can see everyone else in the room
let joinStream = async () => {
  // the has_joined flag is used to check if the user has joined the room
  // we do this to activate the eye tracking and focus features only after the user has joined
  sessionStorage.setItem("has_joined", true);
  console.log("User has joined, setting has_joined to true");
  // document.getElementById("join-btn").style.display = "none";
  document.getElementsByClassName("stream__actions")[0].style.display = "flex";

  localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

  let player = `<div class="video__container" id="user-container-${uid}">
                    <div class="video-player" id="user-${uid}"></div>
                </div>`;

  document
    .getElementById("streams__container")
    .insertAdjacentHTML("beforeend", player);

  localTracks[1].play(`user-${uid}`);
  await client.publish([localTracks[0], localTracks[1]]);
  const videoContainer = document.getElementById(`user-container-${uid}`);
  videoContainer.classList.add("me");
  const nameLabel = document.createElement("div");
  nameLabel.classList.add("name-label");
  nameLabel.textContent = users[uid].name;
  if(isHost){
    nameLabel.textContent += " 👑";
    hostMarked = true;
  }
  videoContainer.appendChild(nameLabel);
  groups[uid] = [uid];
  updateNameLabels();
  channel.sendMessage({
    text: JSON.stringify({ type: "user_joined", uid: uid, name: userName }),
  });
  if(isHost){
    channel.sendMessage({
      text: JSON.stringify({ type: "host_joined", hostID: uid })
    })
  }
  console.log("User has joined, sending user_joined message");
};

// handleUserPublished is called when other users join the room
// the user is subscribed to the other user's audio and video tracks
// the other user's audio and video tracks are played on the user's screen
// the other user's name is displayed on their video
let handleUserPublished = async (user, mediaType) => {
  remoteUsers[user.uid] = user;
  let { name } = await rtmClient.getUserAttributesByKeys(user.uid, ["name"]);
  console.log(name);
  await client.subscribe(user, mediaType);

  let player = document.getElementById(`user-container-${user.uid}`);
  if (player === null) {
    if(isHost){
      player = `<div class="video__container" id="user-container-${user.uid}">
                  <div class="video-player" id="user-${user.uid}"></div>
                  <div class="name-label">${name}</div>
                  <button class="mute-btn" id="mute-btn-${user.uid}">Mute</button>
                </div>`;
    }else{
      player = `<div class="video__container" id="user-container-${user.uid}">
                  <div class="video-player" id="user-${user.uid}"></div>
                  <div class="name-label">${name}</div>
                </div>`;
    }

    document
      .getElementById("streams__container")
      .insertAdjacentHTML("beforeend", player);
  }

  if (mediaType === "video") {
    user.videoTrack.play(`user-${user.uid}`);
    const videoContainer = document.getElementById(
      `user-container-${user.uid}`
    );
    const nameLabel = document.createElement("div");
    nameLabel.classList.add("name-label");
    nameLabel.textContent = name;
    if(isHost){
      const muteButton = document.getElementById(`mute-btn-${user.uid}`);
      muteButton.addEventListener("click", async () => {
        if(muteButton.textContent === "Mute"){
          await channel.sendMessage({
            text: JSON.stringify({
              type: "mute_user",
              to: user.uid
            })
          })
          muteButton.textContent = "Unmute";
        }else{
          await channel.sendMessage({
            text: JSON.stringify({
              type: "unmute_user",
              to: user.uid
            })
          })
          muteButton.textContent = "Mute";
        }
      })
    }
    // const focusButton = document.getElementById(`focus-btn-${user.uid}`);
    // focusButton.addEventListener("click", async() => {
    //   let videoContainer = document.getElementById(`user-container-${userID}`);
    //   if(!videoContainer.classList.contains("focused-user")){
    //     await focusOnUser(user.uid);
    //   }else{
    //     await unfocusFromUser(user.uid);
    //   }
    // });
    videoContainer.appendChild(nameLabel);
  }

  if (mediaType === "audio") {
    user.audioTrack.play();
  }
  updateVolumeAndBorderColor();
  updateNameLabels();
};

// handleUserLeft is called when other users leave the room
// the user is unsubscribed from the other user's audio and video tracks
// the other user's video is removed from the user's screen
let handleUserLeft = async (user) => {
  delete remoteUsers[user.uid];
  let item = document.getElementById(`user-container-${user.uid}`);
  if (item) {
    item.remove();
  }

  for (let group in groups) {
    let index = groups[group].indexOf(user.uid);
    if (index !== -1) {
      groups[group].splice(index, 1);
      for (let remainingUserID of groups[group]) {
        groups[remainingUserID] = [...groups[group]];
      }
    }
  }

  delete groups[user.uid];

  delete users[user.uid];
};

async function fetchSvg(filename) {
  let response = await fetch(filename);
  let data = await response.text();
  return data;
}



// toggleMic and toggleCamera are called when the user presses the mute and camera buttons
let toggleMic = async (e) => {
  let button = e.currentTarget;

  if (localTracks[0].muted) {
    await localTracks[0].setMuted(false);
    button.classList.add("active");
    let micOnSvg = await fetchSvg("images/mic-on.svg");
    button.innerHTML = micOnSvg;
  } else {
    await localTracks[0].setMuted(true);
    button.classList.remove("active");
    let micOffSvg = await fetchSvg("images/mic-off.svg");
    button.innerHTML = micOffSvg;
  }
};

let hostToggleMic = async () => {
  let button = document.getElementById("mic-btn");
  if(localTracks[0].muted) {
    button.disabled = false;
    await localTracks[0].setMuted(false);
    button.classList.add("active");
    let micOnSvg = await fetchSvg("images/mic-on.svg");
    button.innerHTML = micOnSvg;
  }else{
    await localTracks[0].setMuted(true);
    button.classList.remove("active");
    let micOffSvg = await fetchSvg("images/mic-off.svg");
    button.innerHTML = micOffSvg;
    button.disabled = true;
  }
}

let toggleCamera = async (e) => {
  let button = e.currentTarget;

  if (localTracks[1].muted) {
    await localTracks[1].setMuted(false);
    button.classList.add("active");
    let videoOnSvg = await fetchSvg("images/video-on.svg");
    button.innerHTML = videoOnSvg;
  } else {
    await localTracks[1].setMuted(true);
    button.classList.remove("active");
    let videoOffSvg = await fetchSvg("images/video-off.svg");
    button.innerHTML = videoOffSvg;
  }
};

// leaveStream is called when the user presses the leave call button
// the user's audio and video tracks are unpublished
// the user is unsubscribed from the other user's audio and video tracks
// the user's video is removed from the other user's screen
// if host everyone gets a message saying host has ended the meeting
let leaveStream = async (e) => {
  if (e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }

  // document.getElementById("join-btn").style.display = "block";
  document.getElementsByClassName("stream__actions")[0].style.display = "none";

  for (let i = 0; localTracks.length > i; i++) {
    localTracks[i].stop();
    localTracks[i].close();
  }

  await client.unpublish([localTracks[0], localTracks[1]]);

  document.getElementById(`user-container-${uid}`).remove();

  channel.sendMessage({
    text: JSON.stringify({ type: "user_left", uid: uid }),
  });
  if (isHost) {
    channel.sendMessage({ text: JSON.stringify({ type: "end_meeting" }) });
  }

  leaveChannel();
  window.location = "index.html";
};

// updateVolumeAndBorderColor is called when the user joins the room and when other users join the room
// or when a focus event happens
// it updates the volume and border color of the user's video based on the groups object
// if the user is in a group, their volume is set to 100 and their border color is green
// if the user is not in a group, their volume is set to 20 and their border color is red
function updateVolumeAndBorderColor() {
  for (let userId in users) {
    console.log(`Updating ${userId}`);
    if (userId === uid) {
      console.log(`Skipping ${userId} ${uid}`);
      continue;
    }
    let videoContainer = document.getElementById(`user-container-${userId}`);
    if (videoContainer) {
      if (groups[userId] && groups[userId].includes(uid)) {
        setBorderColor("green", userId);
        changeVolume(100, userId);
      } else {
        setBorderColor("red", userId);
        changeVolume(20, userId);
      }
    }
  }
}

function updateNameLabels(){
  let assignedGroups = {};
  groupSymbols = ['🅰', '🅱', '🅲', '🅳', '🅴', '🅵', '🅶', '🅷', '🅸', '🅹', '🅺', '🅻', '🅼', '🅽', '🅾', '🅿', '🆀', '🆁', '🆂', '🆃', '🆄', '🆅', '🆆', '🆇', '🆈', '🆉'];

  for( let userID in groups){
    let group = groups[userID].sort().toString();
    if(!assignedGroups[group]){
      assignedGroups[group] = groupSymbols.shift();
    }else{
      assignedGroups[group] = assignedGroups[group];
    }

    let videoContainer = document.getElementById(`user-container-${userID}`);
    if(videoContainer){
      let nameLabel = videoContainer.getElementsByClassName("name-label")[0];
      if(nameLabel){
        if(userID == hostUID && !hostMarked){
          nameLabel.textContent += " 👑";
          hostMarked = true;
        }
        nameLabel.textContent = nameLabel.textContent.split(" - ")[0];
        nameLabel.textContent += ` - ${assignedGroups[group]}`;
      }
    }
    console.log(assignedGroups);
  }
}

// handleChannelMessage is called when a message is sent in the channel
// the message is parsed and handled based on the type of message
// user_left: the user who left is removed from the groups object
// user_joined: the user who joined is added to the users object
// user_list: the user who joined gets a copy of the users and groups objects
// end_meeting: the user is redirected to the lobby
// focus: the user who is focusing on the other user is added to the other user's group
// group_update: the user updates their group based on the group_update message

let handleChannelMessage = async (messageData) => {
  let data = JSON.parse(messageData.text);
  console.log(`New message: ${data.type}`);
  console.log(data);

  if (data.type === "user_left") {
    document.getElementById(`user-container-${data.uid}`).remove();
    delete groups[data.uid];
  }

  if (data.type === "user_joined") {
    users[data.uid] = {
      id: data.uid,
      name: data.name,
    };
    groups[data.uid] = [data.uid];
    console.log(users);
    console.log(groups);
    if(isHost){
      await channel.sendMessage({
        text: JSON.stringify({
          type: "host_joined",
          hostID: hostUID
        })
      })
    }
    await channel.sendMessage({
      text: JSON.stringify({
        type: "user_list",
        users: users,
        groups: groups,
        to: data.uid,
      }),
    });
    updateVolumeAndBorderColor();
    updateNameLabels();
  }

  if (data.type === "user_list" && data.to === uid) {
    users = data.users;
    groups = data.groups;
    console.log(users);
    console.log(groups);
    updateVolumeAndBorderColor();
    updateNameLabels();
  }

  if (data.type === "end_meeting") {
    alert("The host has ended the meeting. Redirecting to Lobby...");
    leaveStream();
    leaveChannel();
    window.location = "index.html";
  }

  if(data.type === "host_joined"){
    console.log("Host has joined/already exists");
    hostUID = data.hostID;
  }

  if (data.type === "focus" && data.to === uid) {
    console.log(`User ${data.from} is focusing on ${data.to}.`);
    if (data.to === uid) {
      let promptingName = users[data.from].name;

      for (let userId in groups) {
        let index = groups[userId].indexOf(data.from);
        if (index !== -1) {
          groups[userId].splice(index, 1);
          console.log(`From focus handler: removed ${userId} from a group: ${groups[userId]}`)
        }
      }

      for(let userId in groups){
        for(let remainingUserId of groups[userId]){
          groups[remainingUserId] = [...groups[userId]];
        }
      }

      delete groups[data.from];
      console.log(`From focus handler:`)
      console.log(groups)

      let focusedUserGroup = groups[data.to];

      if (!focusedUserGroup) {
        groups[data.to] = [data.to, data.from];
        groups[data.from] = [data.to, data.from];
      } else {
        focusedUserGroup.push(data.from);

        for (let userId of focusedUserGroup) {
          groups[userId] = [...focusedUserGroup];
        }
      }
      console.log(`After addition: ${groups}`)

      console.log(groups[data.to]);
      console.log(groups[data.from]);
      console.log(groups);
      updateVolumeAndBorderColor();
      updateNameLabels();
      alert(`${promptingName} is focusing on you.`);
      
      await channel.sendMessage({
          text: JSON.stringify({
            type: "group_update",
            from: uid,
            group: groups[data.to],
          }),
        });
    }
  }

  if (data.type === "unfocus" && data.to === uid) {
    console.log(`User ${data.to} is unfocusing from ${data.from}.`);
  
    // Find the group the user is currently in
    let currentGroup = groups[data.to];
  
    // Remove the user from this group
    let index = currentGroup.indexOf(data.to);
    if (index !== -1) {
      currentGroup.splice(index, 1);
    }
  
    // Update the groups for all remaining users in the group
    for (let userId of currentGroup) {
      groups[userId] = [...currentGroup];
    }
  
    // Isolate the user
    groups[data.to] = [data.to];
  
    console.log(groups);
  
    updateVolumeAndBorderColor();
    updateNameLabels();
  
    // Send a group_update message
    for (let userId in users) {
      await channel.sendMessage({
        text: JSON.stringify({
          type: "group_update",
          from: uid,
          group: groups[data.to],
        }),
      });
    }
  }

  if (data.type === "group_update") {
    // Update the group information for the users in the group
    if(data.from !== uid){
      for (let userId of data.group) {
        groups[userId] = data.group;
      }
    }
    console.log(groups);
    updateVolumeAndBorderColor();
    updateNameLabels();
  }

  if(data.type === "mute_all"){
    hostToggleMic();
  }

  if(data.type === "unmute_all"){
    hostToggleMic();
  }

  if(data.type === "mute_user" && data.to === uid){
    console.log("Muting user");
    hostToggleMic();
  }

  if(data.type === "unmute_user" && data.to === uid){
    console.log("Unmuting user");
    hostToggleMic();
  }
};

// leaveChannel is called when the user leaves the room
// the user leaves the channel and logs out of the RTM client
let leaveChannel = async () => {
  await channel.leave();
  await rtmClient.logout();
};

// changeVolume and setBorderColor are helper functions of updateVolumeAndBorderColor
function changeVolume(volumeLevel, userID) {
  if (userID === uid) {
    if (localTracks[0]) {
      localTracks[0].setVolume(volumeLevel);
    }
  } else {
    let userObject = remoteUsers[userID];
    if (userObject && userObject.audioTrack) {
      userObject.audioTrack.setVolume(volumeLevel);
    }
  }
}

function setBorderColor(color, userID) {
  let videoContainer = document.getElementById(`user-container-${userID}`);
  if (videoContainer) {
    if (color === "green") {
      videoContainer.classList.add("focused-user");
      videoContainer.classList.remove("unfocused-user");
    } else {
      videoContainer.classList.add("unfocused-user");
      videoContainer.classList.remove("focused-user");
    }
  }
}

// function updateMuteAllButton(){
//   if(isHost){
//     let muteAllButton = document.getElementById("muteAllButton");
//     for(let micBtn of document.getElementsByClassName("mute-btn")){
//       if(micBtn.textContent === "Unmute"){
//         muteAllButton.textContent = "Unmute All";
//         return;
//       }
//     }

function showButtonsIfHost() {
  if (isHost) {
      document.getElementById('muteAllButton').style.display = 'block';
      // document.getElementById('unmuteAllButton').style.display = 'block';
  }
}

window.onload = function () {
  showButtonsIfHost();
}

// initialize the AgoraRTC client, join the room and setup for the meeting
// the user has not yet fully joined the room, their audio and video tracks have not yet been published
// they fully join when they press the join call button

let joinRoomInit = async () => {
  rtmClient = await AgoraRTM.createInstance(APP_ID);
  await rtmClient.login({ uid, token });

  await rtmClient.addOrUpdateLocalUserAttributes({ name: userName });

  channel = await rtmClient.createChannel(roomId);
  await channel.join();

  client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

  channel.on("ChannelMessage", handleChannelMessage);

  await client.join(APP_ID, roomId, token, uid);

  client.on("user-published", handleUserPublished);
  client.on("user-left", handleUserLeft);

  await joinStream();
};

// wait for room to be initialized
(async () => {
  await joinRoomInit();
})();

// event listeners for the buttons
document.getElementById("camera-btn").addEventListener("click", toggleCamera);
document.getElementById("mic-btn").addEventListener("click", toggleMic);
document.getElementById("leave-btn").addEventListener("click", leaveStream);

if(isHost){
  muteAllButton = document.getElementById("muteAllButton");
  muteAllButton.addEventListener("click", async () => {
    if(muteAllButton.textContent === "Mute All"){
      muteAllButton.textContent = "Unmute All";
      for(micBtn of document.getElementsByClassName("mute-btn")){
        if(micBtn.textContent === "Mute"){
          await channel.sendMessage({
            text: JSON.stringify({
              type: "mute_user",
              to: micBtn.id.split("-")[2]
            })
          })
          micBtn.textContent = "Unmute";
        }
      }
    }else{
      muteAllButton.textContent = "Mute All";
      for(micBtn of document.getElementsByClassName("mute-btn")){
        if(micBtn.textContent === "Unmute"){
          await channel.sendMessage({
            text: JSON.stringify({
              type: "unmute_user",
              to: micBtn.id.split("-")[2]
            })
          })
          micBtn.textContent = "Mute";
        }
      }
    }
    // await channel.sendMessage({
    //   text: JSON.stringify({
    //     type: "mute_all"
    //   })
    // })
  })
  // document.getElementById("unmuteAllButton").addEventListener("click", async () => {
  //   for(micBtn of document.getElementsByClassName("mute-btn")){
  //     if(micBtn.textContent === "Mute"){
  //       await channel.sendMessage({
  //         text: JSON.stringify({
  //           type: "unmute_user",
  //           to: micBtn.id.split("-")[2]
  //         })
  //       })
  //       micBtn.textContent = "Unmute";
  //     }
  //   }
  //   await channel.sendMessage({
  //     text: JSON.stringify({
  //       type: "unmute_all"
  //     })
  //   })
  // })
}


window.addEventListener("beforeunload", leaveChannel);

setInterval(() => {
  updateVolumeAndBorderColor();
  updateNameLabels();
  // updateMuteAllButton();
}, 5000); // 5000 milliseconds = 5 seconds
