/* ============================
   FIREBASE INIT
============================ */

const firebaseConfig = {
  apiKey: "AIzaSyBi-PMbrCNrID4Sci2DYj7l6ewQaxIqJ4k",
  authDomain: "ubgpro.firebaseapp.com",
  projectId: "ubgpro",
  storageBucket: "ubgpro.firebasestorage.app",
  messagingSenderId: "915266692059",
  appId: "1:915266692059:web:699879598f8d9ad96cbdfe",
  measurementId: "G-GCJ09MMXEQ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

/* ============================
   USERNAME + PASSWORD
============================ */

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

async function register(username, password) {
  username = username.toLowerCase();

  if (!isValidUsername(username)) {
    alert("Username must be 3–16 chars, letters/numbers/underscores only");
    return;
  }

  const userDoc = await db.collection("users").doc(username).get();
  if (userDoc.exists) {
    alert("Username already taken");
    return;
  }

  const fakeEmail = `${username}@darkdm.local`;

  const cred = await auth.createUserWithEmailAndPassword(fakeEmail, password);

  await db.collection("users").doc(username).set({
    uid: cred.user.uid,
    username,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Account created, now log in");
}

async function login(username, password) {
  username = username.toLowerCase();
  const fakeEmail = `${username}@darkdm.local`;

  try {
    await auth.signInWithEmailAndPassword(fakeEmail, password);
    document.getElementById("authOverlay").style.display = "none";
  } catch (e) {
    alert("Invalid username or password");
  }
}

async function getCurrentUsername() {
  const uid = auth.currentUser.uid;
  const snap = await db.collection("users").where("uid", "==", uid).limit(1).get();
  if (!snap.empty) return snap.docs[0].data().username;
  return null;
}

/* ============================
   AUTH UI
============================ */

let authMode = "login";

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const authSubmit = document.getElementById("authSubmit");

loginTab.onclick = () => {
  authMode = "login";
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
};

registerTab.onclick = () => {
  authMode = "register";
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
};

authSubmit.onclick = async () => {
  const username = document.getElementById("authUsername").value.trim();
  const password = document.getElementById("authPassword").value.trim();
  if (!username || !password) return;

  if (authMode === "login") {
    await login(username, password);
  } else {
    await register(username, password);
  }
};

/* ============================
   GLOBAL STATE
============================ */

let currentUser = null;
let activeFriend = null;
let messagesUnsub = null;

/* DOM REFS */

const selfAvatar = document.getElementById("selfAvatar");
const selfUsernameEl = document.getElementById("selfUsername");
const friendListEl = document.getElementById("friendList");
const requestListEl = document.getElementById("requestList");
const addFriendInput = document.getElementById("addFriendInput");
const addFriendBtn = document.getElementById("addFriendBtn");
const messagesDiv = document.getElementById("messages");
const chatTitle = document.getElementById("chatTitle");
const chatSubtitle = document.getElementById("chatSubtitle");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

/* ============================
   AUTH STATE
============================ */

auth.onAuthStateChanged(async user => {
  if (!user) return;

  currentUser = await getCurrentUsername();
  if (!currentUser) return;

  selfAvatar.textContent = currentUser[0].toUpperCase();
  selfUsernameEl.textContent = "@" + currentUser;

  document.getElementById("authOverlay").style.display = "none";

  listenFriendRequests();
  listenFriends();
});

/* ============================
   FRIEND SYSTEM
============================ */

// friendRequests: {from, to, status: 'pending'|'accepted'|'declined'}

addFriendBtn.onclick = async () => {
  const target = addFriendInput.value.trim().toLowerCase();
  if (!target || target === currentUser) return;

  const userDoc = await db.collection("users").doc(target).get();
  if (!userDoc.exists) {
    alert("User not found");
    return;
  }

  // Check if already friends
  const friendDoc = await db.collection("users")
    .doc(currentUser)
    .collection("friends")
    .doc(target)
    .get();

  if (friendDoc.exists) {
    alert("Already friends");
    return;
  }

  // Check if request already exists
  const existingReq = await db.collection("friendRequests")
    .where("from", "==", currentUser)
    .where("to", "==", target)
    .where("status", "==", "pending")
    .get();

  if (!existingReq.empty) {
    alert("Request already sent");
    return;
  }

  await db.collection("friendRequests").add({
    from: currentUser,
    to: target,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Friend request sent");
  addFriendInput.value = "";
};

function listenFriendRequests() {
  db.collection("friendRequests")
    .where("to", "==", currentUser)
    .where("status", "==", "pending")
    .onSnapshot(snapshot => {
      requestListEl.innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        const li = document.createElement("li");
        li.className = "request-item";
        li.innerHTML = `
          <span>${data.from}</span>
          <div class="request-actions">
            <button class="icon-btn" data-action="accept">✓</button>
            <button class="icon-btn" data-action="decline">✕</button>
          </div>
        `;

        li.querySelector('[data-action="accept"]').onclick = () => handleRequest(doc.id, data.from, true);
        li.querySelector('[data-action="decline"]').onclick = () => handleRequest(doc.id, data.from, false);

        requestListEl.appendChild(li);
      });
    });
}

async function handleRequest(id, fromUser, accept) {
  const ref = db.collection("friendRequests").doc(id);

  if (!accept) {
    await ref.update({ status: "declined" });
    return;
  }

  await ref.update({ status: "accepted" });

  // Add to both friends lists
  const batch = db.batch();

  const myFriendRef = db.collection("users").doc(currentUser).collection("friends").doc(fromUser);
  const theirFriendRef = db.collection("users").doc(fromUser).collection("friends").doc(currentUser);

  batch.set(myFriendRef, { username: fromUser });
  batch.set(theirFriendRef, { username: currentUser });

  await batch.commit();
}

function listenFriends() {
  db.collection("users")
    .doc(currentUser)
    .collection("friends")
    .onSnapshot(snapshot => {
      friendListEl.innerHTML = "";
      snapshot.forEach(doc => {
        const friendName = doc.id;
        const li = document.createElement("li");
        li.className = "friend-item";
        li.textContent = friendName;
        li.onclick = () => openChat(friendName);
        friendListEl.appendChild(li);
      });
    });
}

/* ============================
   DM CHAT
============================ */

function getRoomId(a, b) {
  return [a, b].sort().join("__");
}

function openChat(friendName) {
  activeFriend = friendName;
  chatTitle.textContent = friendName;
  chatSubtitle.textContent = "Direct Message";

  if (messagesUnsub) messagesUnsub();

  const roomId = getRoomId(currentUser, activeFriend);

  messagesUnsub = db.collection("dmRooms")
    .doc(roomId)
    .collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        const isSelf = msg.from === currentUser;

        div.className = "message" + (isSelf ? " self" : "");

        const timeStr = msg.timestamp
          ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";

        div.innerHTML = `
          <div class="avatar small">${msg.from[0].toUpperCase()}</div>
          <div class="message-body">
            <div class="message-meta">
              <span>${msg.from}</span>
              <span>${timeStr}</span>
            </div>
            <div class="message-text">${msg.text}</div>
          </div>
        `;

        messagesDiv.appendChild(div);
      });

      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

/* ============================
   SEND MESSAGE
============================ */

sendBtn.onclick = sendMessage;
messageInput.onkeydown = e => {
  if (e.key === "Enter") sendMessage();
};

async function sendMessage() {
  if (!activeFriend) return;
  const text = messageInput.value.trim();
  if (!text) return;

  const roomId = getRoomId(currentUser, activeFriend);

  await db.collection("dmRooms")
    .doc(roomId)
    .collection("messages")
    .add({
      from: currentUser,
      to: activeFriend,
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

  messageInput.value = "";
}
