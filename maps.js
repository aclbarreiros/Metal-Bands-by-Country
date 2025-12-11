// ===================== CONFIG BÁSICA DO MAPA =====================
const csvFile = "metal_bands_2017(data_cleanDuplicated).csv";
const width = 960;
const height = 520;

const svg = d3.select("#map")
  .attr("viewBox", [0, 0, width, height])
  .attr("preserveAspectRatio", "xMidYMid meet");

const g = svg.append("g");
const bubbleGroup = g.append("g").attr("class", "bubbles");
bubbleGroup.raise(); 
const rScale = d3.scaleSqrt().range([2, 18]);


// ===================== ZOOM (scroll + drag) =====================
const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .translateExtent([[0,0],[width, height]])
  .on("zoom", (event) => g.attr("transform", event.transform));
svg.call(zoom);

// Projeção e path
const projection = d3.geoNaturalEarth1();
let path = d3.geoPath(projection);

// Tooltip e Modal
const tooltip = d3.select("#tooltip");
const modal = d3.select("#modal");
const modalTitle = modal.select(".modal-title");
const modalBody = modal.select(".modal-body");
const modalControls = modal.select(".modal-controls");
const closeModalBtn = modal.select(".modal-close");
closeModalBtn.on("click", closeModal);
modal.on("click", (event) => {
  const target = event.target;
  if (target === modal.node() || target.classList.contains("modal-overlay")) closeModal();
});

// ===================== ESCALAS =====================

// Sequential VERDE: Escuro -> claro pela intensidade do número de bandas
const colorScale = d3.scaleLinear()
  .domain([0, 0.25, 0.5, 0.75, 1])
  .range([
    "#152715ff",
    "#184D28",
    "#2F8F45",
    "#4CCF6A",
    "#A3F5C1"
  ]);

let countryPaths;
let filteredBands = [];
let countryCounts = new Map();

// Estado dos filtros
let currentDecade = "All";
let currentStatus = "all";
let currentSubgenre = "All";

// Dados carregados
let bands = [];
let countries = [];
let nameToFeature = new Map();

// ===================== MAPA DE NOMES DE PAÍSES =====================
function normalizeOriginName(origin) {
  if (!origin) return "";
  const parts = origin.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const direction = parts[1].toLowerCase();
    if (direction === "south" || direction === "north") {
      return `${direction.charAt(0).toUpperCase()}${direction.slice(1)} ${parts[0]}`;
    }
  }
  return parts[0] || "";
}
function originToWorldName(origin) {
  if (!origin) return null;
  const base = origin.trim();
  const map = {
    USA: "United States of America",
    "U.S.A.": "United States of America",
    UK: "United Kingdom",
    Holland: "Netherlands",
    "The Netherlands": "Netherlands",
    UAE: "United Arab Emirates",
    Russia: "Russia",
    "Russian Federation": "Russia",
    "South Korea": "South Korea",
    "North Korea": "North Korea",
    "Korea, South": "South Korea",
    "Korea, North": "North Korea",
    Korea: "South Korea",
    "Czech Republic": "Czechia"
  };
  return map[base] || base;
}

// ===================== CARREGAR DADOS =====================
Promise.all([
  d3.csv(csvFile, d3.autoType),
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
])
.then(([csvData, world]) => {
  // Processar bandas
  bands = csvData
    .map((d) => {
      const formedYear = +d.formed;
      const decade = isFinite(formedYear) ? Math.floor(formedYear / 10) * 10 : null;
      const originMain = normalizeOriginName(d.origin || "");
      const styles = (d.style || "").split(",").map((s) => s.trim()).filter(Boolean);
      const isActive = d.split === "-";
      return {
        ...d,
        formed_year: formedYear,
        decade,
        origin_main: originMain,
        origin_world: originToWorldName(originMain),
        styles,
        is_active: isActive
      };
    })
    .filter((d) => d.formed_year && !isNaN(d.formed_year));

  // Mapa
  const worldData = topojson.feature(world, world.objects.countries);
  countries = worldData.features;
  nameToFeature = new Map(countries.map((f) => [f.properties.name, f]));

  projection.fitSize([width, height], worldData);
  path = d3.geoPath(projection);

  drawBaseMap();

  // Contorno ao passar o mouse sobre os países 
  countryPaths
    .on("mouseover", function(){ d3.select(this).attr("stroke-width", 1); })
    .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 0.3); });

  // Ligação da interface do utilizador
  populateSubgenreDropdown();
  attachFilterListeners();
  function resetAllFilters() {
    // Resetar estado interno
    currentDecade   = "All";
    currentStatus   = "all";
    currentSubgenre = "All";

    // Resetar controles do formulário
    // Verificar os rádios "All" específicos (evitar disparar change em todos os rádios)
    const decadeAll = d3.select('input[name="decade"][value="All"]').node();
    if (decadeAll) { decadeAll.checked = true; decadeAll.dispatchEvent(new Event('change', { bubbles: true })); }

    const statusAll = d3.select('input[name="status"][value="all"]').node();
    if (statusAll) { statusAll.checked = true; statusAll.dispatchEvent(new Event('change', { bubbles: true })); }

    // Resetar select de subgenero
    const sel = d3.select("#subgenre-select").node();
    if (sel) { sel.value = "All"; sel.dispatchEvent(new Event('change', { bubbles: true })); }

    // Limpar input de pesquisa
    const search = d3.select("#band-search").node();
    if (search) { search.value = ""; search.dispatchEvent(new Event('input', { bubbles: true })); }

    // Debug: log reset action (visivel no browser console)
    try {
      // Certificar segurança das propriedades (double-safety)
      d3.select('input[name="decade"][value="All"]').property('checked', true);
      d3.select('input[name="status"][value="all"]').property('checked', true);
      d3.select('#subgenre-select').property('value', 'All');
      d3.select('#band-search').property('value', '');

      console.info('resetAllFilters: state reset to defaults', {
        currentDecade, currentStatus, currentSubgenre,
        decadeChecked: d3.select('input[name="decade"][value="All"]').property('checked'),
        statusChecked: d3.select('input[name="status"][value="all"]').property('checked'),
        subgenreValue: d3.select('#subgenre-select').property('value'),
        searchValue: d3.select('#band-search').property('value')
      });
    } catch(_) {}

    // Recalcular e redesenhar
    update();
    drawColorLegend(countryCounts);

    // Atualizar badge mostrando filtros ativos
    if (typeof updateActiveFiltersBadge === "function") updateActiveFiltersBadge();
  }
  attachSearchListener(); // <-- pesquisa anexada após o carregamento dos dados

  // Primeiro render
  update();
  drawColorLegend(countryCounts);
  // Botão de reset
  d3.select("#reset-btn").on("click", resetAllFilters);

  // Render final após o carregamento dos dados
  update();
  drawColorLegend(countryCounts);
})
.catch((err) => console.error("Erro ao carregar dados", err));

// ===================== SEARCH BAR =====================
function attachSearchListener() {
  const form  = d3.select("#search-form");
  const input = d3.select("#band-search");
  if (form.empty() || input.empty()) return;

  form.on("submit", (event) => {
    event.preventDefault();
    const q = input.node().value.trim().toLowerCase();
    if (!q) return;

    const hit = bands.find(b => String(b.band_name).toLowerCase().includes(q));
    if (!hit) { showToast(`No band found for "<strong>${escapeHTML(input.node().value)}</strong>"`); return; }

    const countryName = hit.origin_world;
    const feature = nameToFeature.get(countryName);
    if (!feature) { showToast(`No map feature for "<strong>${escapeHTML(countryName || "unknown")}</strong>"`); return; }

    const countryBands = bands.filter(b => b.origin_world === countryName);
    openCountryBandModal(countryName, countryBands, { highlightBand: hit.band_name });
    flashCountryBubble(feature);
  });
}

// ===================== LEGENDA DE COR (reutilizável) ===================== /
function drawColorLegend(countsMap) {
  const host = d3.select("#color-legend");
  if (host.empty()) return;

  const values = Array.from(countsMap.values());
  const max = values.length ? d3.max(values) : 1;
  const thresholds = [0, max*0.25, max*0.5, max*0.75, max];
  const colors = ["#152715ff", "#184D28", "#2F8F45", "#4CCF6A", "#A3F5C1"];

  const data = thresholds.map((t, i) => ({
    label: i === 0 ? `0–${Math.ceil(thresholds[1])}` : `${Math.ceil(thresholds[i])}–${Math.ceil(thresholds[i+1] ?? max)}`,
    color: colors[i]
  }));

  const row = host.selectAll("div.legend-row")
    .data(data).join("div")
    .attr("class", "legend-row")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "8px")
    .style("margin", "4px 0");

  row.selectAll("span.swatch").data(d => [d]).join("span")
    .attr("class", "swatch")
    .style("display", "inline-block").style("width", "14px").style("height", "14px")
    .style("background", d => d.color).style("border", "1px solid #333").style("border-radius", "3px");

  row.selectAll("span.label").data(d => [d]).join("span")
    .attr("class", "label")
    .style("font-size", "12px").style("color", "#b3b3b3")
    .text(d => d.label);
}

// ================= PEQUENOS AJUSTES PARA O SEARCH UX =================
function showToast(html) {
  tooltip.style("opacity", 1).attr("aria-hidden", "false").html(html)
    .style("left", `20px`).style("top",  `20px`);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => hideTooltip(), 1400);
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
  ));
}

// ===================== FLASH BUBBLE AO PROCURAR BANDA =====================
function flashCountryBubble(feature) {
  try {
    const xy = projection(d3.geoCentroid(feature));
    const countryName = feature && feature.properties && feature.properties.name;
    // tentar reutilizar o preenchimento do caminho do país existente quando disponível
    let fill = '#f5f5f5';
    try {
      const pathEl = countryPaths && countryPaths.filter && countryPaths.filter(d => d.properties.name === countryName).node();
      if (pathEl) fill = d3.select(pathEl).attr('fill') || fill;
    } catch (_) {}

    bubbleGroup.append("circle")
      .attr("cx", xy[0]).attr("cy", xy[1]).attr("r", 2).attr("class", "country-bubble")
      .attr("fill", fill).style("fill-opacity", 0.9)
      .transition().duration(800).attr("r", 26).style("opacity", 0).remove();
  } catch (_) {}
}

// ===================== DESENHAR MAPA BASE =====================
function drawBaseMap() {
  const countriesGroup = g.append("g").attr("class", "countries");
  countryPaths = countriesGroup
    .selectAll("path")
    .data(countries)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", "#1a5725ff")
    .attr("stroke", "#000")
    .attr("stroke-width", 0.3);
}

// ===================== SUBGÉNEROS =====================
function populateSubgenreDropdown() {
  const allSubgenres = Array.from(new Set(bands.flatMap((d) => d.styles))).sort(d3.ascending);
  const select = d3.select("#subgenre-select");
  select.append("option").attr("value", "All").text("All subgenres");
  allSubgenres.forEach((s) => select.append("option").attr("value", s).text(s));
}

// ===================== FILTROS =====================
function attachFilterListeners() {
  d3.selectAll('input[name="decade"]').on("change", (e) => { currentDecade = e.target.value; update(); });
  d3.selectAll('input[name="status"]').on("change", (e) => { currentStatus = e.target.value; update(); });
  d3.select("#subgenre-select").on("change", (e) => { currentSubgenre = e.target.value; update(); });
}

// ===================== UPDATE =====================
function update() {
  filteredBands = bands
    .filter((d) => (currentDecade === "All" ? true : d.decade === +currentDecade))
    .filter((d) => currentStatus === "all" ? true : currentStatus === "active" ? d.is_active : !d.is_active)
    .filter((d) => currentSubgenre === "All" ? true : d.styles.includes(currentSubgenre));

  countryCounts = d3.rollup(filteredBands, (v) => v.length, (d) => d.origin_world);
  const maxCount = d3.max(countryCounts.values()) || 1;

  // Fill map
  countryPaths
    .attr("fill", (d) => {
      const val = countryCounts.get(d.properties.name) || 0;
      const t = val / maxCount;
      return colorScale(t);
    })
    .classed("disabled", (d) => (countryCounts.get(d.properties.name) || 0) === 0)
    .on("mousemove", (event, d) => handleCountryHover(event, d))
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => handleCountryClick(event, d));

  // Sobreposição de bolhas removida: bolhas estáticas de países estão ocultas por design.
  // Remover quaisquer bolhas estáticas existentes para evitar mostrar círculos ao redor dos países.
  rScale.domain([1, maxCount]);
  bubbleGroup.selectAll("circle.country-bubble").remove();

  drawBubbleLegend(maxCount);

function updateActiveFiltersBadge() {
  const badge = d3.select("#active-filters");
  if (badge.empty()) return;

  const filters = [];
  if (currentDecade !== "All")   filters.push(`${currentDecade}s`);
  if (currentStatus !== "all")   filters.push(currentStatus);
  if (currentSubgenre !== "All") filters.push(currentSubgenre);

  const resetBtn = d3.select("#reset-btn");
  if (!filters.length) {
    badge.attr("hidden", true).text("");
    resetBtn.classed("pulse", false);
  } else {
    badge.attr("hidden", null).text(`Filters: ${filters.join(" · ")}`);
    resetBtn.classed("pulse", true);
  }
}
document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName || "").toLowerCase();
  const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
  if (typing) return;

  if (e.key.toLowerCase() === "r") {
    const btn = document.getElementById("reset-btn");
    if (btn) btn.click();
  }
});
updateActiveFiltersBadge();
}

// ===================== LEGENDAS DE BOLHAS =====================
function drawBubbleLegend(maxCount) {
  const host = d3.select(".bubble-legend");
  if (host.empty()) return;

  const w = 160, h = 64;
  const svgLeg = host.selectAll("svg").data([null]).join("svg").attr("width", w).attr("height", h);
  svgLeg.selectAll("*").remove();
  const gLeg = svgLeg.append("g").attr("transform", "translate(10,10)");

  const vals = [Math.max(1, Math.round(maxCount*0.1)), Math.max(2, Math.round(maxCount*0.5)), maxCount];
  vals.forEach((v, i) => {
    const x = 20 + i*50, y = 24, r = rScale(v);
    gLeg.append("circle")
      .attr("cx", x).attr("cy", y).attr("r", r)
      .attr("class", "legend-bubble")
      .attr("fill", colorScale(v / maxCount))
      .style("fill-opacity", 0.9);
    gLeg.append("text").attr("x", x).attr("y", y + r + 12).attr("text-anchor", "middle").text(v);
  });
}

// ===================== INTERAÇÕES DE PAÍS =====================
function handleCountryHover(event, feature) {
  const countryName = feature.properties.name;
  const count = countryCounts.get(countryName) || 0;
  if (!count) { hideTooltip(); return; }

  // Desdobramento de status para este país nos filtros atuais
  const stats = filteredBands.reduce((acc, d) => {
    if (d.origin_world !== countryName) return acc;
    acc.total += 1;
    d.is_active ? acc.active += 1 : acc.inactive += 1;
    return acc;
  }, { total: 0, active: 0, inactive: 0 });

  const label = (currentSubgenre === "All")
    ? `Bands: ${stats.total}<br/>Active: ${stats.active} &nbsp;•&nbsp; Inactive: ${stats.inactive}`
    : `${currentSubgenre}: ${count}`;

  const wrapperRect = svg.node().parentNode.getBoundingClientRect();
  const x = event.clientX - wrapperRect.left;
  const y = event.clientY - wrapperRect.top;

  tooltip.style("opacity", 1)
    .html(`<strong>${countryName}</strong><br/>${label}`)
    .style("left", `${x + 12}px`)
    .style("top",  `${y - 12}px`);
}
function handleCountryClick(event, feature) {
  const countryName = feature.properties.name;
  const countryBands = filteredBands.filter((b) => b.origin_world === countryName);
  if (!countryBands.length) return;

  if (currentSubgenre === "All") {
    openCountryBandModal(countryName, countryBands);
  } else {
    openBandListModal(countryName, currentSubgenre, countryBands);
  }
}
function hideTooltip() { tooltip.style("opacity", 0).attr("aria-hidden", "true"); }

// ===================== MODAL AUXILIAR =====================
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
function closeModal() { modal.classed("hidden", true); }

function openCountryBandModal(countryName, countryBands, opts = {}) {
  const rows = countryBands.map((b) => ({
    band: b.band_name,
    formed: b.formed_year,
    styles: b.styles.join(", "),
    styleList: b.styles,
    status: b.is_active ? "Active" : `Inactive (${b.split || ""})`,
  })).sort((a, b) => d3.ascending(a.band, b.band));

  const styleFilter = Array.from(new Set(countryBands.flatMap((b) => b.styles)))
    .sort(d3.ascending)
    .map((s) => ({ label: s, value: s }));

  openModalTable({
    title: `${countryName} — bands`,
    columns: [
      { key: "band",   label: "Band" },
      { key: "formed", label: "Formed" },
      { key: "styles", label: "Styles" },
      { key: "status", label: "Status" },
    ],
    rows,
    searchableKeys: ["band", "styles"],
    statusFilter: true,
    styleFilter,
    highlightBand: opts.highlightBand || null
  });

  modal.classed("hidden", false);
  const firstCtrl = modal.node().querySelector(".modal-controls input, .modal-controls select");
  if (firstCtrl) firstCtrl.focus();
}

function openBandListModal(countryName, subgenreName, countryBands, opts = {}) {
  const rows = countryBands.filter((b) => b.styles.includes(subgenreName)).map((b) => ({
    band: b.band_name,
    formed: b.formed_year,
    styles: b.styles.join(", "),
    styleList: b.styles,
    status: b.is_active ? "Active" : `Inactive (${b.split || ""})`,
  })).sort((a, b) => d3.ascending(a.band, b.band));

  const styleFilter = Array.from(new Set(countryBands.flatMap((b) => b.styles)))
    .sort(d3.ascending)
    .map((s) => ({ label: s, value: s }));

  openModalTable({
    title: `${countryName} — ${subgenreName} bands`,
    columns: [
      { key: "band",   label: "Band" },
      { key: "formed", label: "Formed" },
      { key: "styles", label: "Styles" },
      { key: "status", label: "Status" },
    ],
    rows,
    searchableKeys: ["band", "styles"],
    statusFilter: true,
    styleFilter,
    highlightBand: opts.highlightBand || null
  });

  modal.classed("hidden", false);
  const firstCtrl = modal.node().querySelector(".modal-controls input, .modal-controls select");
  if (firstCtrl) firstCtrl.focus();
}

// ===================== RENDERIZADOR DE TABELA ÚNICA COM SUPORTE A DESTAQUE =====================
function openModalTable({
  title,
  columns,
  rows,
  searchableKeys,
  statusFilter,
  styleFilter,
  highlightBand = null
}) {
  modalTitle.text(title);
  modalBody.html("");
  modalControls.html("");

  const searchInput = modalControls.append("input").attr("type", "search").attr("placeholder", "Search...");
  let statusSelect = null;
  let styleSelect  = null;

  if (statusFilter) {
    statusSelect = modalControls.append("select").on("change", applyFilters);
    statusSelect.selectAll("option")
      .data([
        { label: "All statuses", value: "all" },
        { label: "Active",       value: "active" },
        { label: "Inactive",     value: "inactive" }
      ])
      .join("option")
      .attr("value", (d) => d.value)
      .text((d) => d.label);
  }

  if (styleFilter && styleFilter.length) {
    styleSelect = modalControls.append("select").on("change", applyFilters);
    styleSelect.selectAll("option")
      .data([{ label: "All genres", value: "all" }, ...styleFilter])
      .join("option")
      .attr("value", (d) => d.value || d)
      .text((d) => d.label || d);
  }

  const table = modalBody.append("table");
  const thead = table.append("thead");
  const tbody = table.append("tbody");

  thead.append("tr").selectAll("th").data(columns).join("th").text((d) => d.label);

  const norm = (s) => String(s || "")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const highlightNorm = highlightBand ? norm(highlightBand) : null;
  if (highlightBand) { searchInput.node().value = highlightBand; }

  searchInput.on("input", applyFilters);

  function applyFilters() {
    const term = searchInput.node().value.trim().toLowerCase();
    const statusValue = statusSelect ? statusSelect.node().value : "all";
    const styleValue  = styleSelect  ? styleSelect.node().value  : "all";

    const filteredRows = rows.filter((row) => {
      const matchesSearch = !term
        ? true
        : (searchableKeys || columns.map((c) => c.key)).some((key) =>
            String(row[key] || "").toLowerCase().includes(term)
          );

      const matchesStatus = statusSelect
        ? statusValue === "all"
          ? true
          : statusValue === "active"
          ? row.status === "Active"
          : row.status !== "Active"
        : true;

      const matchesStyle = styleSelect
        ? styleValue === "all"
          ? true
          : (row.styleList || []).includes(styleValue)
        : true;

      return matchesSearch && matchesStatus && matchesStyle;
    });

    const rowSel = tbody.selectAll("tr").data(filteredRows, (d) => d.band);
    const tr = rowSel.join("tr");

    tr.selectAll("td")
      .data((d) => columns.map((col) => d[col.key] ?? ""))
      .join("td")
      .text((d) => d);

    tr.classed("highlight", (d) => !!highlightNorm && norm(d.band) === highlightNorm);

    const hlEl = tbody.select("tr.highlight").node();
    if (hlEl) hlEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  applyFilters();
  modal.classed("hidden", false);
}
