document.addEventListener("DOMContentLoaded", function () {
  var yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  var params = new URLSearchParams(window.location.search);

  // Cake Gallery 页面：点击上方按钮切换不同分类区域
  var tabs = document.querySelectorAll(".category-tabs .category-tab");
  if (tabs.length) {
    // 根据 URL ?category=xxx 选择默认分类（没有就用 decorated）
    var initialCategory = params.get("category") || "decorated";

    function activateCategory(category) {
      tabs.forEach(function (t) {
        var cat = t.getAttribute("data-category");
        t.classList.toggle("active", cat === category);
      });
      var sections = document.querySelectorAll("[data-category-section]");
      sections.forEach(function (section) {
        section.classList.toggle(
          "is-active",
          section.getAttribute("data-category-section") === category
        );
      });
    }

    // 页面加载时先按 URL 设一次
    activateCategory(initialCategory);

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = tab.getAttribute("data-category");
        if (!target) return;

        activateCategory(target);
      });
    });
  }

  // Cake Gallery：无 ?sub= 时显示当前分类的「全部」，有 ?sub= 时显示对应子类
  var category = params.get("category") || "decorated";
  var defaultSub = category + "-all";
  var initialSub = params.get("sub") || defaultSub;
  var subBlocks = document.querySelectorAll("[data-subcategory-block]");
  if (subBlocks.length) {
    subBlocks.forEach(function (block) {
      var blockSub = block.getAttribute("data-subcategory-block");
      block.classList.toggle(
        "is-active",
        blockSub === initialSub
      );
    });
  }

  // 点击带下拉的分类标签时跳到「全部」视图（去掉 ?sub=）
  ["decorated", "fondant", "french"].forEach(function (cat) {
    var tab = document.querySelector(".category-tab[data-category='" + cat + "']");
    if (tab) {
      tab.addEventListener("click", function () {
        var url = window.location.pathname + "?category=" + cat;
        if (window.location.search !== "?category=" + cat) {
          window.location.href = url;
        }
      });
    }
  });

  // 首页和 Cake Gallery 小图点击放大预览（共用一个 lightbox）
  var thumbImages = document.querySelectorAll(
    ".home-thumb-item img.thumb-image, .category-grid img.thumb-image"
  );
  if (thumbImages.length) {
    var lightboxOverlay = document.createElement("div");
    lightboxOverlay.className = "lightbox-overlay";
    lightboxOverlay.innerHTML =
      '<div class="lightbox-backdrop"></div>' +
      '<div class="lightbox-content">' +
      '  <img class="lightbox-image" src="" alt="Large view" />' +
      '  <button type="button" class="lightbox-close" aria-label="Close">&times;</button>' +
      "</div>";
    document.body.appendChild(lightboxOverlay);

    var lightboxImg = lightboxOverlay.querySelector(".lightbox-image");

    function openLightbox(src, alt) {
      lightboxImg.src = src;
      lightboxImg.alt = alt || "";
      lightboxOverlay.classList.add("is-open");
      document.body.classList.add("lightbox-open");
    }

    function closeLightbox() {
      lightboxOverlay.classList.remove("is-open");
      document.body.classList.remove("lightbox-open");
    }

    lightboxOverlay.addEventListener("click", closeLightbox);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });

    document.body.addEventListener("click", function (e) {
      var img = e.target.closest(".home-thumb-item img.thumb-image, .category-item img.thumb-image");
      if (img) {
        e.preventDefault();
        openLightbox(img.src, img.alt);
      }
    });
    thumbImages.forEach(function (img) {
      img.style.cursor = "pointer";
    });
  }
});