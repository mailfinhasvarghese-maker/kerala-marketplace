(function () {
  "use strict";

  // Shared UI translations for provider and administration pages.
  // User-entered names, addresses, descriptions, reviews and other content are not translated.
  const translations = {
    ml: {
      "Language":"ഭാഷ","Provider Dashboard":"സേവനദാതാവിന്റെ ഡാഷ്ബോർഡ്","Provider review":"സേവനദാതാവിന്റെ പരിശോധന",
      "Nattukaar Admin":"നാട്ടുകാരൻ അഡ്മിൻ","Nattukaar Super Admin":"നാട്ടുകാരൻ സൂപ്പർ അഡ്മിൻ",
      "Public site":"പൊതു വെബ്സൈറ്റ്","View marketplace":"മാർക്കറ്റ്‌പ്ലേസ് കാണുക","Sign out":"ലോഗ് ഔട്ട് ചെയ്യുക",
      "Refresh":"പുതുക്കുക","Refresh bookings":"ബുക്കിംഗുകൾ പുതുക്കുക","Refresh data":"വിവരങ്ങൾ പുതുക്കുക","Refresh list":"പട്ടിക പുതുക്കുക",
      "Loading…":"ലോഡ് ചെയ്യുന്നു…","Loading...":"ലോഡ് ചെയ്യുന്നു…","Please wait…":"ദയവായി കാത്തിരിക്കുക…",
      "Provider workspace":"സേവനദാതാവിന്റെ പ്രവർത്തനമേഖല","Manage customer requests…":"ഉപഭോക്തൃ അഭ്യർത്ഥനകൾ നിയന്ത്രിക്കുക…",
      "Account settings":"അക്കൗണ്ട് ക്രമീകരണങ്ങൾ","Booking management":"ബുക്കിംഗ് നിയന്ത്രണം","Customer bookings":"ഉപഭോക്തൃ ബുക്കിംഗുകൾ",
      "All requests":"എല്ലാ അഭ്യർത്ഥനകളും","Needs response":"മറുപടി ആവശ്യമാണ്","Accepted / active":"അംഗീകരിച്ചത് / സജീവം",
      "Public provider profile":"പൊതു സേവനദാതൃ പ്രൊഫൈൽ","Save provider details":"സേവനദാതാവിന്റെ വിവരങ്ങൾ സേവ് ചെയ്യുക",
      "Business / service name":"ബിസിനസ് / സേവനത്തിന്റെ പേര്","Contact person":"ബന്ധപ്പെടേണ്ട വ്യക്തി","Phone":"ഫോൺ",
      "Public contact email":"പൊതു ബന്ധപ്പെടൽ ഇമെയിൽ","Category":"വിഭാഗം","District":"ജില്ല","Town":"നഗരം",
      "Experience":"പരിചയം","Address":"വിലാസം","Services":"സേവനങ്ങൾ","Description":"വിവരണം",
      "Service photos":"സേവനത്തിന്റെ ചിത്രങ്ങൾ","Upload photos":"ചിത്രങ്ങൾ അപ്‌ലോഡ് ചെയ്യുക","Save changes":"മാറ്റങ്ങൾ സേവ് ചെയ്യുക",
      "Booking overview":"ബുക്കിംഗ് അവലോകനം","Total bookings":"ആകെ ബുക്കിംഗുകൾ","Pending":"കാത്തിരിക്കുന്നു",
      "Accepted":"അംഗീകരിച്ചു","Completed":"പൂർത്തിയായി","Rejected":"നിരസിച്ചു","Accept":"അംഗീകരിക്കുക",
      "Reject":"നിരസിക്കുക","Complete":"പൂർത്തിയാക്കുക","View details":"വിശദാംശങ്ങൾ കാണുക","Customer":"ഉപഭോക്താവ്",
      "Customer name":"ഉപഭോക്താവിന്റെ പേര്","Customer phone":"ഉപഭോക്താവിന്റെ ഫോൺ","Customer email":"ഉപഭോക്താവിന്റെ ഇമെയിൽ",
      "Booking date":"ബുക്കിംഗ് തീയതി","Requested date":"ആവശ്യപ്പെട്ട തീയതി","Message":"സന്ദേശം","Your response":"നിങ്ങളുടെ മറുപടി",
      "Offer amount":"വാഗ്ദാനം ചെയ്യുന്ന തുക","Counter offer":"മറുവില നിർദ്ദേശം","Submit":"സമർപ്പിക്കുക","Save":"സേവ് ചെയ്യുക",
      "Cancel":"റദ്ദാക്കുക","Close":"അടയ്ക്കുക","Edit":"തിരുത്തുക","Delete":"നീക്കുക","Search":"തിരയുക",
      "Search bookings":"ബുക്കിംഗുകൾ തിരയുക","Search providers":"സേവനദാതാക്കളെ തിരയുക","Clear":"മായ്ക്കുക",
      "Clear form":"ഫോം മായ്ക്കുക","Clear filters":"ഫിൽട്ടറുകൾ നീക്കുക","No bookings found.":"ബുക്കിംഗുകളൊന്നും കണ്ടെത്തിയില്ല.",
      "No results found.":"ഫലങ്ങളൊന്നും കണ്ടെത്തിയില്ല.","No pending provider registrations.":"പരിശോധനയ്ക്കായി പുതിയ രജിസ്ട്രേഷനുകളില്ല.",
      "Admin access required":"അഡ്മിൻ അനുമതി ആവശ്യമാണ്","Super admin access required":"സൂപ്പർ അഡ്മിൻ അനുമതി ആവശ്യമാണ്",
      "Provider and category management":"സേവനദാതാക്കളുടെയും വിഭാഗങ്ങളുടെയും നിയന്ത്രണം",
      "Service categories":"സേവന വിഭാഗങ്ങൾ","All providers":"എല്ലാ സേവനദാതാക്കളും","Manage all providers":"എല്ലാ സേവനദാതാക്കളെയും നിയന്ത്രിക്കുക",
      "Create category":"വിഭാഗം സൃഷ്ടിക്കുക","Save category":"വിഭാഗം സേവ് ചെയ്യുക","Clear form":"ഫോം മായ്ക്കുക",
      "Name":"പേര്","Slug (optional)":"സ്ലഗ് (ഐച്ഛികം)","Icon / emoji":"ഐക്കൺ / ഇമോജി","Sort order":"ക്രമം",
      "Visibility":"ദൃശ്യത","Active / visible":"സജീവം / ദൃശ്യം","Inactive / hidden":"നിഷ്ക്രിയം / മറച്ചത്",
      "Description":"വിവരണം","Business name":"ബിസിനസിന്റെ പേര്","Contact name":"ബന്ധപ്പെടേണ്ട വ്യക്തിയുടെ പേര്",
      "Email":"ഇമെയിൽ","Status":"നില","Pending review":"പരിശോധന കാത്തിരിക്കുന്നു","Active":"സജീവം","Inactive":"നിഷ്ക്രിയം",
      "Provider review":"സേവനദാതാവിന്റെ പരിശോധന","Review new provider registrations before they appear in public listings.":"പൊതു പട്ടികയിൽ കാണിക്കുന്നതിന് മുമ്പ് പുതിയ സേവനദാതൃ രജിസ്ട്രേഷനുകൾ പരിശോധിക്കുക.",
      "Admin API key":"അഡ്മിൻ API കീ","Enter the Cloudflare ADMIN_API_KEY secret":"Cloudflare ADMIN_API_KEY രഹസ്യ കീ നൽകുക",
      "Connect & load pending":"കണക്റ്റ് ചെയ്ത് കാത്തിരിക്കുന്നവ ലോഡ് ചെയ്യുക","Clear key":"കീ മായ്ക്കുക",
      "Refresh list":"പട്ടിക പുതുക്കുക","Check database structure":"ഡാറ്റാബേസ് ഘടന പരിശോധിക്കുക",
      "Customer review moderation":"ഉപഭോക്തൃ റിവ്യൂ നിയന്ത്രണം","Confirm & Activate":"സ്ഥിരീകരിച്ച് സജീവമാക്കുക",
      "Reject registration":"രജിസ്ട്രേഷൻ നിരസിക്കുക","Publish review":"റിവ്യൂ പ്രസിദ്ധീകരിക്കുക","Reject review":"റിവ്യൂ നിരസിക്കുക",
      "Performance overview":"പ്രകടന അവലോകനം","Dashboard":"ഡാഷ്ബോർഡ്","Bookings":"ബുക്കിംഗുകൾ","Providers":"സേവനദാതാക്കൾ",
      "Search by name, phone or service":"പേര്, ഫോൺ അല്ലെങ്കിൽ സേവനം ഉപയോഗിച്ച് തിരയുക","Filter":"ഫിൽട്ടർ",
      "Date":"തീയതി","From":"മുതൽ","To":"വരെ","Today":"ഇന്ന്","This week":"ഈ ആഴ്ച","This month":"ഈ മാസം",
      "Booking details":"ബുക്കിംഗ് വിശദാംശങ്ങൾ","Provider details":"സേവനദാതാവിന്റെ വിശദാംശങ്ങൾ",
      "Category management":"വിഭാഗ നിയന്ത്രണം","Provider management":"സേവനദാതൃ നിയന്ത്രണം",
      "Job roles":"ജോലി വിഭാഗങ്ങൾ","Staff accounts":"സ്റ്റാഫ് അക്കൗണ്ടുകൾ","Permissions":"അനുമതികൾ",
      "Add provider":"സേവനദാതാവിനെ ചേർക്കുക","Update provider":"സേവനദാതാവിനെ പുതുക്കുക",
      "Create account":"അക്കൗണ്ട് സൃഷ്ടിക്കുക","Update":"പുതുക്കുക","Back":"തിരികെ","Next":"അടുത്തത്",
      "First name":"പേര്","Last name":"കുടുംബപ്പേര്","Password":"പാസ്‌വേഡ്","Confirm password":"പാസ്‌വേഡ് സ്ഥിരീകരിക്കുക",
      "Login":"ലോഗിൻ","Log in":"ലോഗിൻ ചെയ്യുക","Sign in":"സൈൻ ഇൻ ചെയ്യുക","Sign out":"ലോഗ് ഔട്ട് ചെയ്യുക",
      "Registration":"രജിസ്ട്രേഷൻ","Register":"രജിസ്റ്റർ ചെയ്യുക","Required":"നിർബന്ധമാണ്",
      "An error occurred. Please try again.":"ഒരു പിശക് സംഭവിച്ചു. വീണ്ടും ശ്രമിക്കുക.",
      "Saved successfully.":"വിജയകരമായി സേവ് ചെയ്തു.","Changes saved.":"മാറ്റങ്ങൾ സേവ് ചെയ്തു.",
      "Are you sure?":"നിങ്ങൾക്ക് ഉറപ്പാണോ?","Yes":"അതെ","No":"ഇല്ല"
    },
    hi: {
      "Language":"भाषा","Provider Dashboard":"सेवा प्रदाता डैशबोर्ड","Provider review":"सेवा प्रदाता समीक्षा",
      "Nattukaar Admin":"नाट्टुकार एडमिन","Nattukaar Super Admin":"नाट्टुकार सुपर एडमिन",
      "Public site":"सार्वजनिक वेबसाइट","View marketplace":"मार्केटप्लेस देखें","Sign out":"साइन आउट",
      "Refresh":"रीफ़्रेश करें","Refresh bookings":"बुकिंग रीफ़्रेश करें","Refresh data":"डेटा रीफ़्रेश करें","Refresh list":"सूची रीफ़्रेश करें",
      "Loading…":"लोड हो रहा है…","Loading...":"लोड हो रहा है…","Please wait…":"कृपया प्रतीक्षा करें…",
      "Provider workspace":"सेवा प्रदाता कार्यक्षेत्र","Manage customer requests…":"ग्राहक अनुरोध प्रबंधित करें…",
      "Account settings":"खाता सेटिंग्स","Booking management":"बुकिंग प्रबंधन","Customer bookings":"ग्राहक बुकिंग",
      "All requests":"सभी अनुरोध","Needs response":"जवाब आवश्यक","Accepted / active":"स्वीकृत / सक्रिय",
      "Public provider profile":"सार्वजनिक सेवा प्रदाता प्रोफ़ाइल","Save provider details":"सेवा प्रदाता का विवरण सेव करें",
      "Business / service name":"व्यवसाय / सेवा का नाम","Contact person":"संपर्क व्यक्ति","Phone":"फ़ोन",
      "Public contact email":"सार्वजनिक संपर्क ईमेल","Category":"श्रेणी","District":"ज़िला","Town":"शहर",
      "Experience":"अनुभव","Address":"पता","Services":"सेवाएँ","Description":"विवरण",
      "Service photos":"सेवा की तस्वीरें","Upload photos":"तस्वीरें अपलोड करें","Save changes":"बदलाव सेव करें",
      "Booking overview":"बुकिंग अवलोकन","Total bookings":"कुल बुकिंग","Pending":"लंबित",
      "Accepted":"स्वीकृत","Completed":"पूर्ण","Rejected":"अस्वीकृत","Accept":"स्वीकार करें",
      "Reject":"अस्वीकार करें","Complete":"पूरा करें","View details":"विवरण देखें","Customer":"ग्राहक",
      "Customer name":"ग्राहक का नाम","Customer phone":"ग्राहक का फ़ोन","Customer email":"ग्राहक का ईमेल",
      "Booking date":"बुकिंग की तारीख","Requested date":"अनुरोधित तारीख","Message":"संदेश","Your response":"आपका जवाब",
      "Offer amount":"प्रस्तावित राशि","Counter offer":"प्रति-प्रस्ताव","Submit":"जमा करें","Save":"सेव करें",
      "Cancel":"रद्द करें","Close":"बंद करें","Edit":"संपादित करें","Delete":"हटाएँ","Search":"खोजें",
      "Search bookings":"बुकिंग खोजें","Search providers":"सेवा प्रदाता खोजें","Clear":"साफ़ करें",
      "Clear form":"फ़ॉर्म साफ़ करें","Clear filters":"फ़िल्टर साफ़ करें","No bookings found.":"कोई बुकिंग नहीं मिली।",
      "No results found.":"कोई परिणाम नहीं मिला।","No pending provider registrations.":"कोई लंबित सेवा प्रदाता पंजीकरण नहीं है।",
      "Admin access required":"एडमिन की अनुमति आवश्यक है","Super admin access required":"सुपर एडमिन की अनुमति आवश्यक है",
      "Provider and category management":"सेवा प्रदाता और श्रेणी प्रबंधन",
      "Service categories":"सेवा श्रेणियाँ","All providers":"सभी सेवा प्रदाता","Manage all providers":"सभी सेवा प्रदाताओं का प्रबंधन करें",
      "Create category":"श्रेणी बनाएँ","Save category":"श्रेणी सेव करें","Name":"नाम","Slug (optional)":"स्लग (वैकल्पिक)",
      "Icon / emoji":"आइकन / इमोजी","Sort order":"क्रम","Visibility":"दृश्यता","Active / visible":"सक्रिय / दिखाई दे रहा है",
      "Inactive / hidden":"निष्क्रिय / छिपा हुआ","Description":"विवरण","Business name":"व्यवसाय का नाम",
      "Contact name":"संपर्क नाम","Email":"ईमेल","Status":"स्थिति","Pending review":"समीक्षा लंबित","Active":"सक्रिय","Inactive":"निष्क्रिय",
      "Review new provider registrations before they appear in public listings.":"नई सेवा प्रदाता प्रविष्टियों को सार्वजनिक सूची में दिखाने से पहले उनकी समीक्षा करें।",
      "Admin API key":"एडमिन API कुंजी","Enter the Cloudflare ADMIN_API_KEY secret":"Cloudflare ADMIN_API_KEY सीक्रेट दर्ज करें",
      "Connect & load pending":"कनेक्ट करें और लंबित प्रविष्टियाँ लोड करें","Clear key":"कुंजी साफ़ करें",
      "Check database structure":"डेटाबेस संरचना जाँचें","Customer review moderation":"ग्राहक समीक्षा प्रबंधन",
      "Confirm & Activate":"पुष्टि करें और सक्रिय करें","Reject registration":"पंजीकरण अस्वीकार करें",
      "Publish review":"समीक्षा प्रकाशित करें","Reject review":"समीक्षा अस्वीकार करें",
      "Performance overview":"प्रदर्शन अवलोकन","Dashboard":"डैशबोर्ड","Bookings":"बुकिंग","Providers":"सेवा प्रदाता",
      "Search by name, phone or service":"नाम, फ़ोन या सेवा से खोजें","Filter":"फ़िल्टर",
      "Date":"तारीख","From":"से","To":"तक","Today":"आज","This week":"इस सप्ताह","This month":"इस महीने",
      "Booking details":"बुकिंग विवरण","Provider details":"सेवा प्रदाता विवरण",
      "Category management":"श्रेणी प्रबंधन","Provider management":"सेवा प्रदाता प्रबंधन",
      "Job roles":"कार्य भूमिकाएँ","Staff accounts":"स्टाफ़ खाते","Permissions":"अनुमतियाँ",
      "Add provider":"सेवा प्रदाता जोड़ें","Update provider":"सेवा प्रदाता अपडेट करें",
      "Create account":"खाता बनाएँ","Update":"अपडेट करें","Back":"वापस","Next":"अगला",
      "First name":"पहला नाम","Last name":"उपनाम","Password":"पासवर्ड","Confirm password":"पासवर्ड की पुष्टि करें",
      "Login":"लॉगिन","Log in":"लॉग इन करें","Sign in":"साइन इन करें","Registration":"पंजीकरण","Register":"रजिस्टर करें",
      "Required":"अनिवार्य","An error occurred. Please try again.":"एक त्रुटि हुई। कृपया फिर प्रयास करें।",
      "Saved successfully.":"सफलतापूर्वक सेव किया गया।","Changes saved.":"बदलाव सेव किए गए।",
      "Are you sure?":"क्या आप निश्चित हैं?","Yes":"हाँ","No":"नहीं"
    }
  };

  const reverse = new Map();
  Object.values(translations).forEach(dict => Object.entries(dict).forEach(([en, local]) => reverse.set(local, en)));
  const originals = new WeakMap();
  const rendered = new WeakMap();
  const attrOriginals = new WeakMap();
  const attrRendered = new WeakMap();
  let language = "en";

  function sourceText(node) {
    const current = node.nodeValue;
    const last = rendered.get(node);
    if (last !== undefined && current === last) return originals.get(node) || current;
    const source = reverse.get(current.trim());
    const base = source || current;
    originals.set(node, base);
    return base;
  }

  function translateText(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement) return;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/i.test(node.parentElement.tagName)) return;
    const current = node.nodeValue;
    if (!current.trim()) return;
    const base = sourceText(node);
    const leading = base.match(/^\s*/)?.[0] || "";
    const trailing = base.match(/\s*$/)?.[0] || "";
    const key = base.trim();
    const translated = language === "en" ? key : (translations[language][key] || key);
    const output = leading + translated + trailing;
    if (current !== output) node.nodeValue = output;
    rendered.set(node, output);
  }

  function translateAttribute(element, name) {
    if (!element.hasAttribute(name)) return;
    let originalsForElement = attrOriginals.get(element);
    let renderedForElement = attrRendered.get(element);
    if (!originalsForElement) { originalsForElement = {}; attrOriginals.set(element, originalsForElement); }
    if (!renderedForElement) { renderedForElement = {}; attrRendered.set(element, renderedForElement); }
    const current = element.getAttribute(name);
    if (renderedForElement[name] !== undefined && current === renderedForElement[name]) {
      // Keep the original English source already stored below.
    } else {
      originalsForElement[name] = reverse.get(current) || current;
    }
    const base = originalsForElement[name] || current;
    const translated = language === "en" ? base : (translations[language][base] || base);
    if (current !== translated) element.setAttribute(name, translated);
    renderedForElement[name] = translated;
  }

  function scan(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { translateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      ["placeholder", "title", "aria-label"].forEach(name => translateAttribute(root, name));
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) translateText(node);
    if (root.querySelectorAll) root.querySelectorAll("[placeholder],[title],[aria-label]").forEach(el =>
      ["placeholder", "title", "aria-label"].forEach(name => translateAttribute(el, name))
    );
  }

  function setLanguage(value) {
    language = ["en", "ml", "hi"].includes(value) ? value : "en";
    document.documentElement.lang = language;
    try { localStorage.setItem("nattukaar-language", language); } catch (_) {}
    scan(document.body);
    const select = document.querySelector("#nattukaarLanguageControl select");
    if (select) select.value = language;
  }
  window.nattukaarSetLanguage = setLanguage;

  document.addEventListener("DOMContentLoaded", function () {
    // The public homepage has its own selector and translation dictionaries.
    if (document.getElementById("languageToggle")) return;

    const box = document.createElement("label");
    box.id = "nattukaarLanguageControl";
    box.style.cssText = "display:inline-flex;gap:6px;align-items:center;font:13px Arial,sans-serif;margin:4px 0";
    const label = document.createElement("span");
    label.textContent = "Language";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Choose language");
    select.style.cssText = "padding:7px 9px;border:1px solid #cbd8cf;border-radius:8px;background:#fff;color:#17231d";
    [["en","English"],["ml","മലയാളം"],["hi","हिन्दी"]].forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    });
    select.addEventListener("change", () => setLanguage(select.value));
    box.append(label, select);
    const host = document.querySelector(".nav-actions,.actions,header") || document.body;
    host.appendChild(box);

    let saved = "en";
    try { saved = localStorage.getItem("nattukaar-language") || "en"; } catch (_) {}
    setLanguage(saved);

    const observer = new MutationObserver(records => records.forEach(record => {
      if (record.type === "characterData") {
        translateText(record.target);
      } else if (record.type === "attributes") {
        translateAttribute(record.target, record.attributeName);
      } else {
        record.addedNodes.forEach(node => scan(node));
      }
    }));
    observer.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label"]
    });
  });
})();