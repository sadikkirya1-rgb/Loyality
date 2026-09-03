/* =========================================================
  CRANE POINTS APPLICATION
   Frontend / PWA prototype
   ========================================================= */

const STORAGE = {
  points:"aurelia_points_v2",
  visits:"aurelia_visits_v2",
  transactions:"aurelia_transactions_v2",
  referrals:"aurelia_referrals_v2",
  notifications:"aurelia_notifications_v2"
};

let points = Number(localStorage.getItem(STORAGE.points) || 2450);
let visits = Number(localStorage.getItem(STORAGE.visits) || 18);

let transactions =
  JSON.parse(
    localStorage.getItem(STORAGE.transactions) || "[]"
  );

let referrals =
  Number(localStorage.getItem(STORAGE.referrals) || 0);

const analytics = {
  queue:[],
  trackEvent(eventName, properties = {}){
    const event = {
      name:eventName,
      properties,
      time:new Date().toISOString()
    };

    this.queue.push(event);

    try{
      localStorage.setItem(
        "aurelia_analytics_events",
        JSON.stringify(this.queue.slice(-200))
      );
    }catch(error){
      console.debug("Analytics storage unavailable", error);
    }

    console.debug("[analytics]", event);
  },
  trackFunnel(step, properties = {}){
    this.trackEvent("funnel", { step, ...properties });
  },
  trackPerformance(label, value){
    this.trackEvent("performance", { label, value });
  },
  trackRetention(){
    this.trackEvent("retention", {
      role:currentRole,
      visits,
      points
    });
  }
};

let pendingRetry = null;
let pendingConfirmation = null;
let customerAuthenticated = localStorage.getItem("aurelia_customer_logged_in") === "1";
let merchantAuthenticated = localStorage.getItem("aurelia_merchant_logged_in") === "1";
let adminAuthenticated = localStorage.getItem("aurelia_admin_logged_in") === "1";

let stream = null;
let scanning = false;
let scanAnimation = null;
let merchantScanStream = null;
let merchantScanAnimation = null;
let lastMerchantCode = "";
let lastMerchantCodeTime = 0;
let pendingScan = null;
let installPrompt = null;
let lastScannedValue = "";
let lastScanTime = 0;
const requestedRole = new URLSearchParams(window.location.search).get("role");
const savedRole = localStorage.getItem("aurelia_role");
const validRoles = ["customer", "merchant", "admin"];
let currentRole = validRoles.includes(requestedRole)
  ? requestedRole
  : validRoles.includes(savedRole)
    ? savedRole
    : "customer";


/* =========================================================
   NAVIGATION
   ========================================================= */

function updateRoleContext(){
  const badge = document.getElementById("roleBadge");
  const subtitle = document.getElementById("roleSubtitle");

  if(!badge || !subtitle){
    return;
  }

  if(currentRole === "merchant"){
    badge.textContent = "MERCHANT";
    subtitle.textContent = "Sales overview";
    return;
  }

  if(currentRole === "admin"){
    badge.textContent = "ADMIN";
    subtitle.textContent = "Platform control";
    return;
  }

  badge.textContent = "CUSTOMER";
  subtitle.textContent = "Premium wallet";
}

function syncRoleAccess(view){
  const customerViews = ["home","rewards","activity","profile","scan"];
  const merchantViews = ["home"];
  const adminViews = ["admin"];

  if(currentRole === "merchant" && customerViews.includes(view)){
    return "home";
  }

  if(currentRole === "admin" && !adminViews.includes(view)){
    return "admin";
  }

  if(currentRole === "customer" && merchantViews.includes(view)){
    return "home";
  }

  return view;
}

function showView(view){

  const allowedView = syncRoleAccess(view);

  document
    .querySelectorAll(".view")
    .forEach(el=>{
      el.classList.remove("active");
    });

  const target =
    document.getElementById(allowedView);

  if(target){
    target.classList.add("active");
  }

  document
    .querySelectorAll(".nav")
    .forEach(nav=>{
      nav.classList.toggle(
        "active",
        nav.dataset.view === view
      );
    });

  if(view !== "scan"){
    stopScanner();
  }

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });

  if(view === "rewards"){
    renderRewards();
  }

  if(view === "activity"){
    renderTransactions();
  }

  if(view === "home"){
    updatePoints();
  }
}

function showMerchantSection(sectionId, button){
  const section = document.getElementById(sectionId);
  const merchantHome = document.getElementById("businessHome");

  if(!section || !merchantHome || currentRole !== "merchant"){
    return;
  }

  Array.from(merchantHome.children)
    .forEach(child=>child.classList.add("hidden"));

  if(sectionId === "businessHome"){
    Array.from(merchantHome.children)
      .forEach(child=>child.classList.remove("hidden"));
  } else {
    section.classList.remove("hidden");
  }

  document
    .querySelectorAll(".merchant-nav")
    .forEach(nav=>nav.classList.remove("active"));
  button.classList.add("active");

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });
}

function showAdminSection(sectionId, button){
  const adminHome = document.getElementById("admin");
  const section = document.getElementById(sectionId);

  if(!adminHome || !section || currentRole !== "admin"){
    return;
  }

  Array.from(adminHome.children)
    .forEach(child=>child.classList.add("hidden"));

  if(sectionId === "admin"){
    Array.from(adminHome.children)
      .forEach(child=>child.classList.remove("hidden"));
  } else {
    section.classList.remove("hidden");
  }

  document
    .querySelectorAll(".admin-nav")
    .forEach(nav=>nav.classList.remove("active"));
  button.classList.add("active");

  setAdminNav(false);

  window.scrollTo({ top:0, behavior:"smooth" });
}

function setAdminNav(isOpen){
  const app = document.querySelector(".app");
  const toggle = document.getElementById("adminMenuToggle");

  if(!app || !toggle){
    return;
  }

  app.classList.toggle("admin-nav-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute(
    "aria-label",
    isOpen ? "Close admin navigation" : "Open admin navigation"
  );
}

function toggleAdminNav(){
  const app = document.querySelector(".app");

  if(app){
    setAdminNav(!app.classList.contains("admin-nav-open"));
  }
}

function hideAuthScreen(){
  const authScreen = document.getElementById("auth");
  if(authScreen){
    authScreen.classList.remove("active");
    authScreen.classList.add("hidden");
  }

  const header = document.querySelector(".header");
  if(header){
    header.classList.remove("hidden");
  }

  const bottomNav = document.querySelector(".bottom-nav");
  if(bottomNav){
    bottomNav.classList.remove("hidden");
    bottomNav.style.display = "grid";
  }

  const app = document.querySelector(".app");
  if(app){
    app.style.paddingBottom = "calc(var(--nav-height) + 25px)";
  }

  const content = document.querySelector(".content");
  if(content){
    content.style.display = "";
  }
}

function showAuthScreen(){
  const authScreen = document.getElementById("auth");
  if(authScreen){
    authScreen.classList.remove("hidden");
    authScreen.classList.add("active");
  }

  const header = document.querySelector(".header");
  if(header){
    header.classList.add("hidden");
  }

  const bottomNav = document.querySelector(".bottom-nav");
  if(bottomNav){
    bottomNav.classList.add("hidden");
    bottomNav.style.display = "none";
  }

  const app = document.querySelector(".app");
  if(app){
    app.style.paddingBottom = "0";
  }

  document.querySelectorAll(".view").forEach(view => {
    if(view.id !== "auth"){
      view.classList.remove("active");
    }
  });

  const content = document.querySelector(".content");
  if(content){
    content.style.display = "none";
  }
}

function syncAuthScreenForRole(){
  const title = document.getElementById("authTitle");
  const subtitle = document.getElementById("authSubtitle");
  const submitBtn = document.getElementById("authSubmitBtn");

  if(!title || !subtitle || !submitBtn){
    return;
  }

  if(currentRole === "merchant"){
    title.textContent = "Welcome back, merchant";
    subtitle.textContent = "Manage your storefront, member scans, and premium reward activity securely.";
    submitBtn.textContent = "Open merchant hub";
    return;
  }

  if(currentRole === "admin"){
    title.textContent = "Admin access";
    subtitle.textContent = "Monitor performance, partner health, approvals, and loyalty operations in real time.";
    submitBtn.textContent = "Enter admin console";
    return;
  }

  title.textContent = "Welcome back, Alex";
  subtitle.textContent = "Secure access to your premium wallet, exclusive rewards, and member benefits.";
  submitBtn.textContent = "Access wallet";
}

function updateLogoutMessage(){
  const title = document.getElementById("logoutTitle");
  const message = document.getElementById("logoutMessage");

  if(!title || !message){
    return;
  }

  if(currentRole === "merchant"){
    title.textContent = "Leave merchant hub?";
    message.textContent = "Your storefront access will end and you will return to the secure merchant sign-in screen.";
    return;
  }

  if(currentRole === "admin"){
    title.textContent = "Exit admin console?";
    message.textContent = "Your admin session will end and you will return to the secure platform sign-in screen.";
    return;
  }

  title.textContent = "Sign out";
  message.textContent = "You will be returned to the secure Crane Points sign-in screen.";
}

function logoutCurrentUser(){
  updateLogoutMessage();
  const modal = document.getElementById("logoutModal");
  if(modal){
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }
}

function confirmLogout(){
  customerAuthenticated = false;
  merchantAuthenticated = false;
  adminAuthenticated = false;

  localStorage.removeItem("aurelia_customer_logged_in");
  localStorage.removeItem("aurelia_merchant_logged_in");
  localStorage.removeItem("aurelia_admin_logged_in");
  localStorage.removeItem("aurelia_customer_email");
  localStorage.removeItem("aurelia_merchant_email");
  localStorage.removeItem("aurelia_admin_email");

  document.querySelectorAll(".customer-nav,.merchant-nav,.admin-nav")
    .forEach(nav=>nav.classList.add("hidden"));

  document.querySelectorAll(".customer-only")
    .forEach(element=>element.classList.add("hidden"));
  document.querySelectorAll(".admin-only")
    .forEach(element=>element.classList.add("hidden"));
  setAdminNav(false);

  if(document.getElementById("authForm")){
    document.getElementById("authForm").reset();
  }

  const modal = document.getElementById("logoutModal");
  if(modal){
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }

  syncAuthScreenForRole();
  showAuthScreen();
  analytics.trackEvent("logout", { role:currentRole });
  toast("Signed out successfully");
}

function cancelLogout(){
  const modal = document.getElementById("logoutModal");
  if(modal){
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
}

function continueAsGuest(){
  if(currentRole === "customer"){
    customerAuthenticated = true;
    localStorage.setItem("aurelia_customer_logged_in", "1");
  }

  if(currentRole === "merchant"){
    merchantAuthenticated = true;
    localStorage.setItem("aurelia_merchant_logged_in", "1");
  }

  if(currentRole === "admin"){
    adminAuthenticated = true;
    localStorage.setItem("aurelia_admin_logged_in", "1");
  }

  hideAuthScreen();
  analytics.trackEvent("guest_access", { role:currentRole });
  switchRole(currentRole);
}

function handleRoleLogin(event){
  event.preventDefault();

  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  if(!email || !email.includes("@") || !password){
    toast("Enter a valid email and password");
    return;
  }

  showLoading("Signing you in");

  setTimeout(()=>{
    if(currentRole === "customer"){
      customerAuthenticated = true;
      localStorage.setItem("aurelia_customer_logged_in", "1");
      localStorage.setItem("aurelia_customer_email", email);
      analytics.trackEvent("customer_login", { email });
    }

    if(currentRole === "merchant"){
      merchantAuthenticated = true;
      localStorage.setItem("aurelia_merchant_logged_in", "1");
      localStorage.setItem("aurelia_merchant_email", email);
      analytics.trackEvent("merchant_login", { email });
    }

    if(currentRole === "admin"){
      adminAuthenticated = true;
      localStorage.setItem("aurelia_admin_logged_in", "1");
      localStorage.setItem("aurelia_admin_email", email);
      analytics.trackEvent("admin_login", { email });
    }

    hideLoading();
    hideAuthScreen();
    switchRole(currentRole);
    toast("Welcome back");
  }, 450);
}

function switchRole(role){

  currentRole = role;
  localStorage.setItem("aurelia_role",role);
  updateRoleContext();

  const app = document.querySelector(".app");
  if(app){
    app.classList.toggle("admin-mode", role === "admin");
  }
  setAdminNav(false);

  document.querySelectorAll(".customer-nav,.merchant-nav,.admin-nav")
    .forEach(nav=>nav.classList.add("hidden"));
  document.querySelectorAll(".customer-only")
    .forEach(element=>element.classList.toggle("hidden",role !== "customer"));
  document.querySelectorAll(".admin-only")
    .forEach(element=>element.classList.toggle("hidden",role !== "admin"));

  if(role === "customer"){
    if(!customerAuthenticated){
      syncAuthScreenForRole();
      showAuthScreen();
      return;
    }
    hideAuthScreen();
    document.querySelectorAll(".customer-nav")
      .forEach(nav=>{
        nav.classList.remove("hidden");
        nav.style.display = "flex";
      });
    showView("home");
    setMode("customer");
    return;
  }

  if(role === "merchant"){
    if(!merchantAuthenticated){
      syncAuthScreenForRole();
      showAuthScreen();
      return;
    }
    hideAuthScreen();
    document.querySelectorAll(".merchant-nav")
      .forEach(nav=>{
        nav.classList.remove("hidden");
        nav.style.display = "flex";
      });
    showView("home");
      const merchantDashboardNav = document.querySelector(".merchant-nav");
      if(merchantDashboardNav){
        merchantDashboardNav.classList.add("active");
      }
    setMode("business");
    return;
  }

  if(!adminAuthenticated){
    syncAuthScreenForRole();
    showAuthScreen();
    return;
  }

  hideAuthScreen();
  document.querySelectorAll(".admin-nav")
    .forEach(nav=>{
      nav.classList.remove("hidden");
      nav.style.display = "flex";
    });
  showView("admin");
  const adminOverviewNav = document.querySelector(".admin-nav");
  if(adminOverviewNav){
    adminOverviewNav.classList.add("active");
  }
  renderCharts();
}

function openScanner(){
  showView("scan");

  setTimeout(()=>{
    const msg =
      document.getElementById("scannerMessage");

    if(msg){
      msg.textContent =
        "Camera is ready. Tap Start Camera Scanner.";
    }
  },100);
}


/* =========================================================
   CUSTOMER / BUSINESS
   ========================================================= */

function setMode(mode){
  document
    .getElementById("customerHome")
    .classList.toggle(
      "hidden",
      mode !== "customer"
    );

  document
    .getElementById("businessHome")
    .classList.toggle(
      "hidden",
      mode !== "business"
    );

  if(mode === "business"){
    Array.from(document.getElementById("businessHome").children)
      .forEach(child=>child.classList.remove("hidden"));
    generateQR();
    renderCharts();
  }
}

async function startMerchantScanner(){
  const result = document.getElementById("merchantScanResult");
  const video = document.getElementById("merchantScannerVideo");

  if(!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    result.textContent = "Camera scanning is not supported by this browser.";
    return;
  }

  if(!window.isSecureContext){
    result.textContent = "Camera access requires HTTPS or localhost.";
    toast("Use HTTPS or localhost");
    return;
  }

  try{
    stopMerchantScanner();
    merchantScanStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } });
    video.srcObject = merchantScanStream;
    await video.play();
    video.classList.remove("hidden");
    result.textContent = "Camera ready. Hold a customer QR code inside the frame.";
    scanMerchantVideo(video, result);
    toast("Merchant scanner ready");
  }catch(error){
    result.textContent = "Camera access was denied. Use manual entry to credit points.";
    toast("Camera permission is required");
  }
}

function scanMerchantVideo(video, result){
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently:true });

  merchantScanAnimation = requestAnimationFrame(function scanFrame(){
    if(!merchantScanStream || video.readyState < 2){
      merchantScanAnimation = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = typeof jsQR === "function" ? jsQR(image.data, image.width, image.height) : null;

    if(code){
      const now = Date.now();

      if(code.data === lastMerchantCode && now - lastMerchantCodeTime < 10000){
        merchantScanAnimation = requestAnimationFrame(scanFrame);
        return;
      }

      lastMerchantCode = code.data;
      lastMerchantCodeTime = now;
      result.textContent = `Validated customer code: ${code.data}`;
      toast("Customer QR validated");
      analytics.trackEvent("merchant_qr_validated", { value:code.data });
      stopMerchantScanner();
      return;
    }

    merchantScanAnimation = requestAnimationFrame(scanFrame);
  });
}

function stopMerchantScanner(){
  if(merchantScanAnimation){
    cancelAnimationFrame(merchantScanAnimation);
    merchantScanAnimation = null;
  }
  if(merchantScanStream){
    merchantScanStream.getTracks().forEach(track=>track.stop());
    merchantScanStream = null;
  }
  const video = document.getElementById("merchantScannerVideo");
  if(video){
    video.pause();
    video.srcObject = null;
    video.classList.add("hidden");
  }
}

function adjustMerchantPoints(){
  const customer = document.getElementById("merchantCustomerLookup").value.trim();
  const amount = Number(document.getElementById("merchantPointAmount").value);
  const result = document.getElementById("merchantScanResult");

  if(!customer || !Number.isFinite(amount) || amount < 1){
    toast("Enter a customer and valid points");
    return;
  }

  result.textContent = `${amount} points credited to ${customer}. Transaction logged.`;
  analytics.trackEvent("merchant_manual_adjustment", { customer, amount });
  toast("Points credited successfully");
}

function saveMerchantScheme(){
  const points = document.getElementById("pointsPerCurrency").value;
  const visits = document.getElementById("milestoneVisits").value;
  toast(`Scheme saved: ${points} point per AED, ${visits}-visit milestone`);
  analytics.trackEvent("merchant_scheme_updated", { points, visits });
}

function publishMerchantPromotion(){
  const title = document.getElementById("promotionTitle").value.trim();
  const windowLabel = document.getElementById("promotionWindow").value.trim();
  const status = document.getElementById("promotionStatus");

  if(!title || !windowLabel){
    toast("Add a title and campaign window");
    return;
  }

  status.textContent = `${title} is live for ${windowLabel}.`;
  toast("Flash deal published");
  analytics.trackEvent("merchant_promotion_published", { title, windowLabel });
}

function filterMerchantSegment(segment, button){
  document.querySelectorAll(".segment-tab").forEach(tab=>tab.classList.remove("active"));
  button.classList.add("active");
  document.querySelectorAll("#merchantCustomerList .customer-row").forEach(row=>{
    row.classList.toggle("hidden", segment !== "all" && row.dataset.segment !== segment);
  });
}

function filterMerchantCustomers(){
  const query = document.getElementById("merchantCustomerSearch").value.toLowerCase().trim();
  document.querySelectorAll("#merchantCustomerList .customer-row").forEach(row=>{
    row.classList.toggle("hidden", query && !row.textContent.toLowerCase().includes(query));
  });
}

function sendMerchantNotification(){
  const title = document.getElementById("merchantNotificationTitle").value.trim();
  const message = document.getElementById("merchantNotificationMessage").value.trim();
  const audience = document.getElementById("merchantNotificationAudience").value;

  if(!title || !message){
    toast("Add a notification title and message");
    return;
  }

  notify(title, message);
  toast(`Notification sent to ${audience.toLowerCase()}`);
  analytics.trackEvent("merchant_notification_sent", { title, audience });
}

function downloadMerchantAsset(asset){
  toast(`${asset} prepared for download`);
  analytics.trackEvent("merchant_asset_requested", { asset });
}

function updateMerchantSecurity(setting){
  toast(`${setting} update flow opened`);
  analytics.trackEvent("merchant_security_update_started", { setting });
}


/* =========================================================
   MEMBERSHIP CARD
   ========================================================= */

function switchCard(type,button){

  const card =
    document.getElementById("atmCard");

  const tier =
    document.getElementById("cardTier");

  card.classList.remove(
    "silver",
    "platinum"
  );

  document
    .querySelectorAll(".card-dot")
    .forEach(dot=>{
      dot.classList.remove("active");
    });

  button.classList.add("active");

  if(type === "silver"){
    card.classList.add("silver");
    tier.textContent = "SILVER";
  }

  if(type === "gold"){
    tier.textContent = "GOLD";
  }

  if(type === "platinum"){
    card.classList.add("platinum");
    tier.textContent = "PLATINUM";
  }
}


/* =========================================================
   POINTS
   ========================================================= */

function updatePoints(){

  const formatted =
    points.toLocaleString();

  setText("cardPoints",formatted);
  setText("totalPoints",formatted);
  setText("walletBalance",formatted+" pts");
  setText("rewardBalance",formatted+" pts");
  setText("visitCount",visits);
  setText("tierCurrent",formatted);

  const target =
    points >= 5000 ? 10000 : 5000;

  const previous =
    points >= 5000 ? "PLATINUM" : "GOLD";

  setText(
    "tierName",
    previous === "PLATINUM"
      ? "PLATINUM MEMBER"
      : "GOLD MEMBER"
  );

  setText(
    "tierTarget",
    target.toLocaleString()+
    (
      target === 10000
        ? " VIP"
        : " Platinum"
    )
  );

  const percentage =
    Math.min(
      100,
      Math.round(
        (points / target) * 100
      )
    );

  document
    .getElementById("tierProgress")
    .style.width =
    percentage+"%";

  const remaining =
    Math.max(target - points,0);

  setText(
    "tierRemaining",
    remaining.toLocaleString()+
    " more points"
  );

  const nextReward =
    Math.max(1000 - (points % 1000),0);

  setText(
    "nextReward",
    nextReward.toLocaleString()
  );

  localStorage.setItem(
    STORAGE.points,
    points
  );

  localStorage.setItem(
    STORAGE.visits,
    visits
  );

  updateChallenge();
  renderTransactions();
}


/* =========================================================
   TRANSACTIONS
   ========================================================= */

function addTransaction(title,amount,type){

  transactions.unshift({

    id:
      crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()),

    title,
    amount:Number(amount),
    type,

    date:
      new Date().toLocaleString(
        [],
        {
          month:"short",
          day:"numeric",
          hour:"2-digit",
          minute:"2-digit"
        }
      )

  });

  transactions =
    transactions.slice(0,50);

  localStorage.setItem(
    STORAGE.transactions,
    JSON.stringify(transactions)
  );
}

function renderTransactions(){

  let list = transactions;

  if(!list.length){
    setHTML(
      "recentTransactions",
      `
        <div class="empty-state compact-empty">
          <div class="empty-icon">↗</div>
          <strong>Your activity is clear</strong>
          <p>No transactions yet. Points earned and redeemed will appear here as your statement.</p>
        </div>
      `
    );

    setHTML(
      "allTransactions",
      `
        <div class="empty-state compact-empty">
          <div class="empty-icon">↗</div>
          <strong>Your activity is clear</strong>
          <p>No transactions yet. Points earned and redeemed will appear here as your statement.</p>
        </div>
      `
    );

    calculateTotals();
    return;
  }

  const html =
    list.map(t=>`

      <div class="transaction statement-item">

        <div class="tx-icon">
          ${t.type === "redeem" ? "♛" : "✦"}
        </div>

        <div class="tx-info">
          <div class="statement-header">
            <b>${escapeHTML(t.title)}</b>
            <span class="statement-badge ${t.type === "redeem" ? "debit" : "credit"}">${t.type === "redeem" ? "Redeem" : "Earn"}</span>
          </div>
          <small>${escapeHTML(t.date)}</small>
        </div>

        <div class="statement-amount ${
          t.type === "redeem"
            ? "negative"
            : "positive"
        }">
          ${
            t.type === "redeem"
              ? "-"
              : "+"
          }${Number(t.amount).toLocaleString()}
        </div>

      </div>

    `).join("");

  setHTML(
    "recentTransactions",
    html
  );

  setHTML(
    "allTransactions",
    html
  );

  calculateTotals();
}

function calculateTotals(){

  const earned =
    transactions
      .filter(t=>t.type==="earn")
      .reduce(
        (sum,t)=>sum+Number(t.amount),
        4820
      );

  const redeemed =
    transactions
      .filter(t=>t.type==="redeem")
      .reduce(
        (sum,t)=>sum+Number(t.amount),
        2370
      );

  setText(
    "earnedTotal",
    "+"+earned.toLocaleString()
  );

  setText(
    "redeemedTotal",
    "-"+redeemed.toLocaleString()
  );
}


/* =========================================================
   EARNING
   ========================================================= */

function earnDemo(){

  points += 100;
  visits++;

  addTransaction(
    "Royal Coffee House",
    100,
    "earn"
  );

  updatePoints();

  notify(
    "Points earned",
    "+100 Crane Points added"
  );

  toast("+100 Crane Points added");
}


/* =========================================================
   REDEMPTION
   ========================================================= */

const rewards = [
  {
    id:"coffee",
    icon:"☕",
    name:"Free Premium Coffee",
    description:"One premium coffee at participating locations.",
    cost:1000
  },
  {
    id:"voucher",
    icon:"◆",
    name:"AED 50 Voucher",
    description:"Redeemable at selected Crane Points partners.",
    cost:2000
  },
  {
    id:"gold",
    icon:"♛",
    name:"Gold Experience",
    description:"Exclusive premium member experience.",
    cost:5000
  },
  {
    id:"vip",
    icon:"✦",
    name:"Platinum VIP Day",
    description:"A full premium VIP experience.",
    cost:10000
  }
];

function renderRewards(){

  const html =
    rewards.map(reward=>{

      const affordable =
        points >= reward.cost;

      return `

        <div class="reward-card">

          <div class="reward-row">

            <div class="reward-icon">
              ${reward.icon}
            </div>

            <div class="reward-info">

              <b>${escapeHTML(reward.name)}</b>

              <small>
                ${escapeHTML(reward.description)}
              </small>

              <div class="reward-cost">
                ${reward.cost.toLocaleString()} POINTS
              </div>

            </div>

            <button
              class="btn ${
                affordable
                  ? "gold-btn"
                  : "light-btn"
              }"
              onclick="redeem(
                ${reward.cost},
                '${escapeJS(reward.name)}'
              )">

              ${
                affordable
                  ? "Redeem"
                  : (
                    (reward.cost-points)
                    .toLocaleString()+" more"
                  )
              }

            </button>

          </div>

        </div>

      `;

    }).join("");

  setHTML(
    "rewardList",
    html || `
      <div class="empty-state">
        <div class="empty-icon">♛</div>
        <strong>Your reward vault is empty</strong>
        <p>New partner offers and premium benefits will appear here once they are unlocked.</p>
      </div>
    `
  );
}

function redeem(cost,name){

  if(points < cost){

    toast(
      "You need "+
      (cost-points).toLocaleString()+
      " more points"
    );

    return;
  }

  const confirmAction = ()=>{
    showLoading("Redeeming reward");

    setTimeout(()=>{
      points -= cost;

      addTransaction(
        name,
        cost,
        "redeem"
      );

      updatePoints();
      renderRewards();

      notify(
        "Reward redeemed",
        name+" is ready to use."
      );

      analytics.trackEvent("reward_redeemed", { name, cost });
      analytics.trackFunnel("reward_redeemed", { name });
      hideLoading();
      toast(
        "Reward redeemed successfully"
      );
      closeActionConfirm();
    }, 400);
  };

  showConfirmation(
    "Redeem reward",
    "Redeem "+name+" for "+cost.toLocaleString()+" points?",
    "Redeem now",
    confirmAction
  );
}


/* =========================================================
   QR SCANNER
   ========================================================= */

async function startScanner(){

  if(scanning){
    return;
  }

  const message =
    document.getElementById(
      "scannerMessage"
    );

  if(
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ){

    message.textContent =
      "Camera scanning is not supported by this browser.";

    toast("Camera unavailable");

    return;
  }

  if(!window.isSecureContext){

    message.textContent =
      "Camera requires HTTPS or localhost.";

    toast("Use HTTPS or localhost");

    return;
  }

  try{

    stream =
      await navigator
        .mediaDevices
        .getUserMedia({

          video:{
            facingMode:{
              ideal:"environment"
            },

            width:{
              ideal:1280
            },

            height:{
              ideal:720
            }
          },

          audio:false

        });

    const video =
      document.getElementById("video");

    video.srcObject = stream;

    await video.play();

    scanning = true;

    document
      .getElementById("startScanBtn")
      .classList
      .add("hidden");

    document
      .getElementById("stopScanBtn")
      .classList
      .remove("hidden");

    message.textContent =
      "Scanning… place the QR inside the frame.";

    startQRLoop(video);

  }catch(error){

    console.error(error);

    if(
      error.name === "NotAllowedError"
    ){

      message.textContent =
        "Camera permission was denied. Allow camera access in your browser settings.";

      toast("Camera permission denied");

    }else if(
      error.name === "NotFoundError"
    ){

      message.textContent =
        "No camera was found on this device.";

      toast("No camera found");

    }else{

      message.textContent =
        "Unable to access the camera.";

      toast("Camera error");
    }
  }
}


/*
  Uses jsQR as the primary fallback so the scanner
  works on browsers where BarcodeDetector is unavailable.
*/

function startQRLoop(video){

  const canvas =
    document.createElement("canvas");

  const context =
    canvas.getContext(
      "2d",
      {
        willReadFrequently:true
      }
    );

  let lastFrame = 0;

  function frame(timestamp){

    if(!scanning){
      return;
    }

    if(
      timestamp - lastFrame > 150 &&
      video.readyState >= 2 &&
      video.videoWidth
    ){

      lastFrame = timestamp;

      const scale =
        Math.min(
          1,
          720 / video.videoWidth
        );

      canvas.width =
        Math.floor(
          video.videoWidth * scale
        );

      canvas.height =
        Math.floor(
          video.videoHeight * scale
        );

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      try{

        const imageData =
          context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

        if(window.jsQR){

          const code =
            jsQR(
              imageData.data,
              imageData.width,
              imageData.height,
              {
                inversionAttempts:"attemptBoth"
              }
            );

          if(code && code.data){

            processScannedValue(
              code.data
            );

            return;
          }
        }

        /*
          BarcodeDetector can additionally be used
          where supported.
        */

        if(
          "BarcodeDetector" in window
        ){

          detectWithNativeDetector(
            video
          );
        }

      }catch(error){
        console.debug(
          "QR frame error",
          error
        );
      }
    }

    scanAnimation =
      requestAnimationFrame(frame);
  }

  scanAnimation =
    requestAnimationFrame(frame);
}

let nativeDetectorPromise = null;

async function detectWithNativeDetector(video){

  if(!("BarcodeDetector" in window)){
    return;
  }

  try{

    if(!nativeDetectorPromise){

      nativeDetectorPromise =
        new BarcodeDetector({
          formats:["qr_code"]
        });

    }

    const detector =
      await nativeDetectorPromise;

    const codes =
      await detector.detect(video);

    if(codes.length){

      processScannedValue(
        codes[0].rawValue || ""
      );
    }

  }catch(error){
    console.debug(
      "Native detector unavailable",
      error
    );
  }
}

function processScannedValue(value){

  if(!scanning){
    return;
  }

  /*
    Prevent repeated detections from the same QR.
  */

  const now = Date.now();

  if(
    value === lastScannedValue &&
    now-lastScanTime < 3000
  ){
    return;
  }

  lastScannedValue = value;
  lastScanTime = now;

  handleQRCode(value);
}


/* =========================================================
   QR VALIDATION
   ========================================================= */

function handleQRCode(value){

  let business =
    "Royal Coffee House";

  let reward = 100;

  /*
    Prototype format:

    AURELIA|BUSINESS001|Royal Coffee House|100|TOKEN

    Production:
    Replace this parser with a server-side token
    verification endpoint.
  */

  const parts =
    value.split("|");

  if(
    parts.length >= 4 &&
    parts[0] === "AURELIA"
  ){

    business =
      parts[2] ||
      business;

    const parsed =
      Number(parts[3]);

    if(
      Number.isFinite(parsed) &&
      parsed > 0 &&
      parsed <= 10000
    ){

      reward = parsed;

    }

  }else{

    /*
      Unknown QR codes should not automatically
      receive points in production.

      Demo behavior shows an error.
    */

    toast("Not a Crane Points QR code");

    return;
  }

  pendingScan = {
    business,
    points:reward,
    raw:value
  };

  analytics.trackEvent("qr_scan_validated", { business, reward });
  stopScanner();

  setText(
    "scanBusiness",
    business
  );

  setText(
    "scanPoints",
    reward.toLocaleString()
  );

  setText(
    "beforeBalance",
    points.toLocaleString()
  );

  setText(
    "afterBalance",
    (points+reward).toLocaleString()
  );

  document
    .getElementById("confirmModal")
    .classList
    .add("show");
}


/* =========================================================
   DEMO SCAN
   ========================================================= */

function demoScan(){

  handleQRCode(
    "AURELIA|BUSINESS001|Royal Coffee House|100|DEMO"
  );
}


/* =========================================================
   CONFIRM SCAN
   ========================================================= */

function confirmScan(){

  if(!pendingScan){
    return;
  }

  showLoading("Applying points");

  setTimeout(()=>{
    points +=
      pendingScan.points;

    visits++;

    addTransaction(
      pendingScan.business,
      pendingScan.points,
      "earn"
    );

    updatePoints();

    notify(
      "Points earned",
      "+"+
      pendingScan.points+
      " points from "+
      pendingScan.business
    );

    analytics.trackEvent("scan_confirmed", { business:pendingScan.business, points:pendingScan.points });
    analytics.trackFunnel("scan_confirmed", { business:pendingScan.business });
    hideLoading();
    closeModal();

    toast(
      "+"+
      pendingScan.points+
      " points added"
    );

    pendingScan = null;
  }, 450);
}


/* =========================================================
   STOP CAMERA
   ========================================================= */

function stopScanner(){

  scanning = false;

  if(scanAnimation){

    cancelAnimationFrame(
      scanAnimation
    );

    scanAnimation = null;
  }

  if(stream){

    stream
      .getTracks()
      .forEach(track=>{
        track.stop();
      });

    stream = null;
  }

  const video =
    document.getElementById("video");

  if(video){
    video.srcObject = null;
  }

  const start =
    document.getElementById(
      "startScanBtn"
    );

  const stop =
    document.getElementById(
      "stopScanBtn"
    );

  if(start){
    start.classList.remove("hidden");
  }

  if(stop){
    stop.classList.add("hidden");
  }
}


/* =========================================================
   BUSINESS QR GENERATOR
   ========================================================= */

function generateQR(){

  const box =
    document.getElementById("qrcode");

  if(!box){
    return;
  }

  /*
    Prototype rotating token.

    Production:
    Generate this on the backend with a short
    expiry and one-time/replay protection.
  */

  const token =
    crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString();

  const data =
    "AURELIA|BUSINESS001|Royal Coffee House|100|"+
    token;

  box.innerHTML = "";

  /*
    QRious is loaded dynamically so this remains
    a single HTML file.
  */

  const script =
    document.createElement("script");

  script.src =
    "https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js";

  script.onload = ()=>{

    const canvas =
      document.createElement("canvas");

    new QRious({
      element:canvas,
      value:data,
      size:180,
      level:"H",
      background:"#ffffff",
      foreground:"#171511"
    });

    box.appendChild(canvas);

  };

  document.body.appendChild(script);
}


/* =========================================================
   REFERRALS
   ========================================================= */

function getReferralLink(){

  return (
    location.origin+
    location.pathname+
    "?ref=ALEX2048"
  );
}

async function copyReferral(){

  const text = getReferralLink();

  try{
    await navigator.clipboard.writeText(text);
    analytics.trackEvent("referral_copied", { text });
    toast("Referral link copied");
    return true;
  }catch(error){
    handleRecoverableError(
      "Unable to copy referral link.",
      "Retry copy",
      ()=>copyReferral()
    );
    console.debug(error);
    return false;
  }
}

async function shareReferral(){

  const text =
    "Join me on Crane Points and earn premium loyalty rewards!";

  const url =
    getReferralLink();

  if(navigator.share){

    try{
      await navigator.share({
        title:"Join Crane Points",
        text,
        url
      });
      analytics.trackEvent("referral_shared", { url });
    }catch(error){
      if(error.name !== "AbortError"){
        console.debug(error);
        handleRecoverableError(
          "Unable to share right now.",
          "Retry share",
          ()=>shareReferral()
        );
      }
    }

  }else{

    await copyReferral();
  }
}


/* =========================================================
   CHALLENGE
   ========================================================= */

function updateChallenge(){

  const completed =
    Math.min(
      3,
      Math.max(
        2,
        visits - 16
      )
    );

  const percentage =
    Math.round(
      (completed/3)*100
    );

  const progress =
    document.getElementById(
      "challengeProgress"
    );

  if(progress){
    progress.style.width =
      percentage+"%";
  }

  setText(
    "challengePercent",
    percentage+"%"
  );

  setText(
    "challengeText",
    completed+
    " of 3 completed • +500 bonus points"
  );
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function notify(title,message){

  const existing =
    JSON.parse(
      localStorage.getItem(
        STORAGE.notifications
      ) || "[]"
    );

  existing.unshift({
    title,
    message,
    date:new Date().toISOString()
  });

  localStorage.setItem(
    STORAGE.notifications,
    JSON.stringify(
      existing.slice(0,30)
    )
  );

  const count =
    document.getElementById(
      "notificationCount"
    );

  if(count){

    const current =
      Number(count.textContent) || 0;

    count.textContent =
      Math.min(
        current+1,
        9
      );
  }
}

function renderNotifications(){
  const modal = document.getElementById("notificationModal");
  if(!modal){
    return;
  }

  const existing = JSON.parse(localStorage.getItem(STORAGE.notifications) || "[]");

  if(!existing.length){
    modal.querySelector(".notification-list").innerHTML = `
      <div class="empty">
        No notifications yet.<br>
        Your rewards and activity updates will appear here.
      </div>
    `;
    return;
  }

  modal.querySelector(".notification-list").innerHTML = existing.map(item=>`
    <div class="transaction">
      <div class="tx-icon">${item.title.includes("Reward") ? "♛" : item.title.includes("Challenge") ? "🔥" : "✦"}</div>
      <div class="tx-info">
        <b>${escapeHTML(item.title)}</b>
        <small>${escapeHTML(item.message)} • ${new Date(item.date).toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}</small>
      </div>
      <span class="positive">NEW</span>
    </div>
  `).join("");
}

function showNotifications(){
  renderNotifications();
  document
    .getElementById(
      "notificationModal"
    )
    .classList
    .add("show");
}

function closeNotificationModal(){

  document
    .getElementById(
      "notificationModal"
    )
    .classList
    .remove("show");

  setText(
    "notificationCount",
    "0"
  );
}


/* =========================================================
   ADMIN
   ========================================================= */

function addBusiness(){

  const name =
    document
      .getElementById("newBusiness")
      .value
      .trim();

  const pointsValue =
    Number(
      document
        .getElementById("newPoints")
        .value
    );

  if(!name){

    toast("Enter a business name");
    return;
  }

  if(
    !Number.isFinite(pointsValue) ||
    pointsValue < 1
  ){

    toast("Enter valid points");
    return;
  }

  showLoading("Adding business");

  setTimeout(()=>{
    document
      .getElementById("newBusiness")
      .value = "";

    notify(
      "Business added",
      name+
      " has been added successfully."
    );

    analytics.trackEvent("business_added", { name, pointsValue });
    analytics.trackFunnel("business_added", { name });
    hideLoading();
    toast(
      name+
      " added successfully"
    );
  }, 500);
}

function toggleButton(button){

  const enabled =
    button.textContent.trim() === "ON";

  button.textContent =
    enabled
      ? "OFF"
      : "ON";

  button.classList.toggle(
    "gold-btn",
    !enabled
  );

  button.classList.toggle(
    "light-btn",
    enabled
  );
}

function reviewAdminItem(button, item){
  button.textContent = "Done";
  button.classList.remove("gold-btn");
  button.classList.add("light-btn");
  button.disabled = true;
  toast(`${item} marked for review`);
  analytics.trackEvent("admin_review_started", { item });
}

function updateAdminSecurity(setting){
  toast(`${setting} settings opened`);
  analytics.trackEvent("admin_security_setting_opened", { setting });
}

function exportAdminAudit(){
  const audit = [
    "Crane Points administrator audit export",
    `Generated: ${new Date().toISOString()}`,
    "Admin login verified",
    "Fraud protection enabled",
    "Partner approval completed"
  ].join("\\n");
  const blob = new Blob([audit], { type:"text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "crane-points-admin-audit.txt";
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Audit export downloaded");
  analytics.trackEvent("admin_audit_exported");
}


/* =========================================================
   OFFERS
   ========================================================= */

function saveOffer(){

  toast(
    "Offer saved to your favorites"
  );

  notify(
    "Offer saved",
    "Maison Luxury is now in your favorites."
  );
}


/* =========================================================
   CHARTS
   ========================================================= */

function renderChart(
  elementId,
  values,
  labels
){

  const container =
    document.getElementById(elementId);

  if(!container){
    return;
  }

  const max =
    Math.max(...values);

  container.innerHTML =
    values.map(
      (value,index)=>`

        <div class="bar-wrap">

          <div style="
            width:100%;
            height:100%;
            display:flex;
            flex-direction:column;
            justify-content:flex-end;
            align-items:center;
          ">

            <div
              class="bar"
              style="
                height:${
                  Math.max(
                    8,
                    (value/max)*100
                  )
                }%;
              "
              title="${value}">
            </div>

            <div class="bar-label">
              ${labels[index]}
            </div>

          </div>

        </div>

      `
    ).join("");
}

function renderCharts(){

  renderChart(
    "businessChart",
    [42,58,51,72,68,84,87],
    ["M","T","W","T","F","S","S"]
  );

  renderChart(
    "adminChart",
    [62,70,66,84,73,92,88],
    ["M","T","W","T","F","S","S"]
  );
}


/* =========================================================
   PWA
   ========================================================= */

function showLoading(text = "Loading your account"){
  const modal = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  if(!modal || !label){
    return;
  }

  label.textContent = text;
  modal.classList.remove("hidden");
}

function hideLoading(){
  const modal = document.getElementById("loadingOverlay");
  if(modal){
    modal.classList.add("hidden");
  }
}

function handleRecoverableError(message, retryLabel, retryFn){
  const modal = document.getElementById("errorModal");
  const title = document.getElementById("errorTitle");
  const body = document.getElementById("errorMessage");
  const retryBtn = document.getElementById("errorRetryBtn");

  if(!modal || !title || !body || !retryBtn){
    toast(message);
    return;
  }

  title.textContent = "Something went wrong";
  body.textContent = message;
  retryBtn.textContent = retryLabel;
  retryBtn.onclick = ()=>{
    hideErrorModal();
    if(retryFn){
      retryFn();
    }
  };

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  pendingRetry = retryFn;
}

function hideErrorModal(){
  const modal = document.getElementById("errorModal");
  if(modal){
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
}

function showConfirmation(title, message, confirmLabel, onConfirm){
  const modal = document.getElementById("actionConfirmModal");
  const titleEl = document.getElementById("confirmTitle");
  const messageEl = document.getElementById("confirmMessage");
  const confirmBtn = document.getElementById("confirmActionBtn");

  if(!modal || !titleEl || !messageEl || !confirmBtn){
    return;
  }

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmLabel;
  confirmBtn.onclick = ()=>{
    if(onConfirm){
      onConfirm();
    }
  };

  pendingConfirmation = onConfirm;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeActionConfirm(){
  const modal = document.getElementById("actionConfirmModal");
  if(modal){
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
  pendingConfirmation = null;
}

function createManifest(){

  const manifest = {
    name:"Crane Points Loyalty",
    short_name:"Crane Points",
    description:"Premium loyalty and rewards",
    start_url:"./",
    scope:"./",
    display:"standalone",
    background_color:"#f7f4ed",
    theme_color:"#f7f4ed",
    orientation:"portrait-primary",
    icons:[
      {
        src:
          "data:image/svg+xml,"+
          encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg"
                 viewBox="0 0 512 512">
              <rect width="512" height="512"
                    rx="110" fill="#bd8a2d"/>
              <text x="50%" y="55%"
                    dominant-baseline="middle"
                    text-anchor="middle"
                    font-size="290"
                    font-family="Arial"
                    font-weight="900"
                    fill="white">A</text>
            </svg>
          `),
        sizes:"512x512",
        type:"image/svg+xml",
        purpose:"any"
      }
    ]
  };

  const blob =
    new Blob(
      [JSON.stringify(manifest)],
      {type:"application/manifest+json"}
    );

  const url =
    URL.createObjectURL(blob);

  document
    .getElementById("manifestLink")
    .href = url;
}


/* =========================================================
   PWA INSTALL PROMPT
   ========================================================= */

window.addEventListener(
  "beforeinstallprompt",
  event=>{

    event.preventDefault();

    installPrompt = event;

    setTimeout(()=>{
      if(
        !localStorage.getItem(
          "aurelia_install_dismissed"
        )
      ){

        document
          .getElementById("installBanner")
          .classList
          .add("show");
      }
    },1800);
  }
);

async function installPWA(){

  if(!installPrompt){

    toast(
      "Use your browser's Add to Home Screen option."
    );

    return;
  }

  installPrompt.prompt();

  const result =
    await installPrompt.userChoice;

  if(
    result.outcome === "accepted"
  ){

    toast("Crane Points installed");

  }

  installPrompt = null;

  dismissInstall();
}

function dismissInstall(){

  document
    .getElementById("installBanner")
    .classList
    .remove("show");

  localStorage.setItem(
    "aurelia_install_dismissed",
    "1"
  );
}


/* =========================================================
   SERVICE WORKER
   ========================================================= */

function registerServiceWorker(){

  /*
    Service workers cannot be safely registered from
    an inline blob in every browser.

    On deployment, create /sw.js and register it here.
  */

  if(
    "serviceWorker" in navigator &&
    location.protocol !== "file:"
  ){

    navigator.serviceWorker
      .register("./sw.js")
      .then(()=>{
        console.log(
          "Crane Points service worker registered"
        );
      })
      .catch(error=>{
        console.debug(
          "Service worker unavailable:",
          error
        );
      });
  }
}


/* =========================================================
   ONLINE / OFFLINE
   ========================================================= */

function updateOnlineState(){

  document
    .getElementById("offlineBar")
    .classList.toggle(
      "show",
      !navigator.onLine
    );
}

window.addEventListener(
  "online",
  updateOnlineState
);

window.addEventListener(
  "offline",
  updateOnlineState
);

window.addEventListener(
  "error",
  event=>{
    console.error("Window error:", event.error || event.message);
    reportError(event.error || new Error(event.message || "Unexpected error"), "window_error");
  }
);

window.addEventListener(
  "unhandledrejection",
  event=>{
    console.error("Unhandled rejection:", event.reason);
    reportError(event.reason || new Error("Unhandled promise rejection"), "promise_rejection");
  }
);

function reportError(error, context = "unknown"){
  const message = error && error.message ? error.message : "An unexpected problem occurred.";
  analytics.trackEvent("app_error", { context, message });

  if(document.getElementById("errorModal") && !document.getElementById("errorModal").classList.contains("show")){
    handleRecoverableError(message, "Retry", ()=>{
      if(pendingRetry){
        pendingRetry();
      } else {
        toast("Retry from the previous action.");
      }
    });
  }
}


/* =========================================================
   MODALS
   ========================================================= */

function closeModal(){

  document
    .getElementById("confirmModal")
    .classList
    .remove("show");

  pendingScan = null;
}

document
  .getElementById("confirmModal")
  .addEventListener(
    "click",
    event=>{

      if(
        event.target ===
        event.currentTarget
      ){
        closeModal();
      }
    }
  );

document
  .getElementById("notificationModal")
  .addEventListener(
    "click",
    event=>{

      if(
        event.target ===
        event.currentTarget
      ){
        closeNotificationModal();
      }
    }
  );


/* =========================================================
   PAGE VISIBILITY
   ========================================================= */

document.addEventListener(
  "visibilitychange",
  ()=>{

    if(
      document.hidden
    ){
      stopScanner();
    }
  }
);


/* =========================================================
   HELPERS
   ========================================================= */

function setText(id,value){

  const element =
    document.getElementById(id);

  if(element){
    element.textContent = value;
  }
}

function setHTML(id,value){

  const element =
    document.getElementById(id);

  if(element){
    element.innerHTML = value;
  }
}

function escapeHTML(value){

  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function escapeJS(value){

  return String(value)
    .replaceAll("\\","\\\\")
    .replaceAll("'","\\'")
    .replaceAll("\n"," ");
}


/* =========================================================
   TOAST
   ========================================================= */

let toastTimer;

function toast(message){

  const element =
    document.getElementById("toast");

  element.textContent =
    message;

  element.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer =
    setTimeout(
      ()=>{
        element.classList.remove("show");
      },
      2800
    );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

function hideSplashScreen(){
  const splashScreen = document.getElementById("splashScreen");

  if(splashScreen){
    splashScreen.classList.add("hidden");
  }
}

function initialize(){

  createManifest();

  updatePoints();
  renderTransactions();
  renderRewards();
  renderCharts();
  generateQR();
  updateOnlineState();

  const authForm = document.getElementById("authForm");
  if(authForm){
    authForm.addEventListener("submit", handleRoleLogin);
  }

  const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
  if(confirmLogoutBtn){
    confirmLogoutBtn.addEventListener("click", confirmLogout);
  }

  const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
  if(cancelLogoutBtn){
    cancelLogoutBtn.addEventListener("click", cancelLogout);
  }

  syncAuthScreenForRole();
  updateRoleContext();

  if(currentRole === "customer" && !customerAuthenticated){
    showAuthScreen();
  } else if(currentRole === "merchant" && !merchantAuthenticated){
    showAuthScreen();
  } else if(currentRole === "admin" && !adminAuthenticated){
    showAuthScreen();
  } else {
    hideAuthScreen();
  }

  switchRole(currentRole);

  const month =
    new Date().toLocaleDateString(
      "en-US",
      {
        month:"long",
        year:"numeric"
      }
    );

  setText(
    "monthLabel",
    month
  );

  /*
    PWA service worker registration.
    Requires /sw.js on the deployed server.
  */

  registerServiceWorker();

  setTimeout(hideSplashScreen, 6000);
}

initialize();

