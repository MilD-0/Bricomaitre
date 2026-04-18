const TIKTOK_PIXEL_ID = "YOUR_TIKTOK_PIXEL_ID";

(function (w, d, t) {
  if (w.ttq) return;

  var ttq = (w.ttq = w.ttq || []);
  ttq.methods = [
    "page",
    "track",
    "identify",
    "instances",
    "debug",
    "on",
    "off",
    "once",
    "ready",
    "alias",
    "group",
    "enableCookie",
    "disableCookie",
  ];
  ttq.setAndDefer = function (t, e) {
    t[e] = function () {
      t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
    };
  };
  for (var i = 0; i < ttq.methods.length; i++) {
    ttq.setAndDefer(ttq, ttq.methods[i]);
  }

  ttq.load = function (e) {
    var n = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i = ttq._i || {};
    ttq._i[e] = [];
    ttq._i[e]._u = n;
    ttq._t = ttq._t || {};
    ttq._t[e] = +new Date();
    var a = document.createElement("script");
    a.type = "text/javascript";
    a.async = true;
    a.src = n + "?sdkid=" + e + "&lib=ttq";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(a, s);
  };

  ttq.load(TIKTOK_PIXEL_ID);
  ttq.page();
})(window, document, "script");
