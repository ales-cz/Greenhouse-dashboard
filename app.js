// ===============================
// KONFIGURACE
// ===============================
const CHANNEL_ID = 2619064;
const READ_API_KEY = "R7SGV6V9IVH43BHL";

// ===============================
// INICIALIZACE GRAFŮ
// ===============================
let chart_temperature;
let chart_humidity;
let chart_illumination;
let chart_pressure;

function initCharts() {
    chart_temperature = echarts.init(document.getElementById("graf_temperature"));
    chart_humidity = echarts.init(document.getElementById("graf_humidity"));
    chart_illumination = echarts.init(document.getElementById("graf_illumination"));
    chart_pressure = echarts.init(document.getElementById("graf_pressure"));
}

initCharts();

const spinner = document.getElementById("loading-overlay");

// ===============================
// HLAVNÍ FUNKCE – NAČTENÍ A VYKRESLENÍ
// ===============================
function fetchDataAndDraw(startStr, endStr) {

    const url = `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${READ_API_KEY}&status=true&start=${startStr}&end=${endStr}`;

    fetch(url)
        .then(r => r.json())
        .then(data => {
            const feeds = data.feeds;

            // ===============================
            // PARSOVÁNÍ ČASŮ
            // ===============================
            const timeUTC = feeds.map(f => new Date(f.created_at));

            const timeLocal = timeUTC.map(t =>
                new Date(t.toLocaleString("en-US", { timeZone: "Europe/Prague" }))
            );

            // ===============================
            // ČTENÍ POLÍ
            // ===============================
            const F = Array.from({ length: 8 }, (_, i) =>
                feeds.map(f => parseFloat(f["field" + (i + 1)]))
            );

            const status = feeds.map(f => (f.status || "").toLowerCase());
            const heater = status.map(s => s.includes("heater"));
            const fan = status.map(s => s.includes("fan"));

            // ===============================
            // MIN/MAX Z PŮVODNÍCH DAT
            // ===============================
            const allTemperatures = [...F[0], ...F[2], ...F[4], ...F[5]].filter(v => !isNaN(v));
            const minTemperature = Math.min(...allTemperatures);
            const maxTemperature = Math.max(...allTemperatures);
            const rangeTemperature = maxTemperature - minTemperature;

            const allHumidity = [...F[1], ...F[3]].filter(v => !isNaN(v));
            const minHumidity = Math.min(...allHumidity);
            const maxHumidity = Math.max(...allHumidity);
            const rangeHumidity = maxHumidity - minHumidity;

            const allIllumination = F[6].filter(v => !isNaN(v));
            const minIllumination = Math.min(...allIllumination);
            const maxIllumination = Math.max(...allIllumination);
            const rangeIllumination = maxIllumination - minIllumination;

            const allPressure = F[7].filter(v => !isNaN(v));
            const minPressure = Math.min(...allPressure);
            const maxPressure = Math.max(...allPressure);
            const rangePressure = maxPressure - minPressure;

            // ===============================
            // HEATER / FAN ÚROVNĚ
            // ===============================
            const yHeater = minTemperature - 0.03 * rangeTemperature;
            const yFan = minTemperature - 0.04 * rangeTemperature;

            const heaterSig = heater.map(h => h ? yHeater : null);
            const fanSig = fan.map(h => h ? yFan : null);

            // ===============================
            // DETEKCE VÝPADKŮ
            // ===============================
            const timestamps = timeLocal.map(t => t.getTime());
            const dt = timestamps.slice(1).map((t, i) => (t - timestamps[i]) / 1000);

            const sorted = [...dt].sort((a, b) => a - b);
            const expectedInterval = sorted[Math.floor(sorted.length / 2)];

            const gapIdx = dt
                .map((d, i) => d > expectedInterval * 2 ? i : -1)
                .filter(i => i >= 0);

            // ===============================
            // VLOŽENÍ NaN DO SIGNÁLŮ
            // ===============================
            for (const i of gapIdx) {

                for (const arr of F) {
                    arr[i] = NaN;
                    arr[i + 1] = NaN;
                }

                heaterSig[i] = NaN;
                heaterSig[i + 1] = NaN;

                fanSig[i] = NaN;
                fanSig[i + 1] = NaN;
            }

            // ===============================
            // KRESLENÍ – ECharts
            // ===============================
            const baseOption = {
                legend: { top: 10, icon: "circle", itemWidth: 10, itemHeight: 10, itemGap: 15 },

                grid: { left: 60, right: 20, top: 50, bottom: 100 },

                dataZoom: [{ type: "slider" }],

                tooltip: {
                    trigger: "axis",
                    axisPointer: { type: "cross", snap: true },

                    formatter: function (params) {
                        let out = echarts.format.formatTime("dd.MM.yyyy hh:mm", params[0].value[0]) + "<br>";

                        params.forEach(p => {
                            let val = p.value[1];

                            if (isNaN(val)) {
                                val = `<span style="color:#888">Ø</span>`;
                            }
                            else if (p.seriesName === "Vytápění" || p.seriesName === "Cirkulace") {
                                val = val !== null
                                    ? `<span style="color:#2ecc71">● zap.</span>`
                                    : `<span style="color:#e74c3c">● vyp.</span>`;
                            }
                            else {
                                val = val.toFixed(1);
                            }

                            out += `${p.marker} ${p.seriesName}: ${val}<br>`;
                        });

                        return out;
                    }
                },

                xAxis: {
                    type: "time", name: "Čas (Europe/Prague)", nameLocation: "middle",
                    splitLine: { show: true, lineStyle: { color: "#eee" } },
                    axisPointer: { label: { formatter: function (params) { return echarts.format.formatTime("dd.MM.yyyy hh:mm", params.value); } } }
                },

                yAxis: [{
                    type: "value", name: "Teplota [°C]", nameLocation: "middle",
                    min: value => minTemperature - 0.05 * rangeTemperature,
                    max: value => maxTemperature + 0.01 * rangeTemperature,
                    axisLabel: { showMinLabel: false, showMaxLabel: false },
                    splitLine: { show: true, lineStyle: { color: "#eee" } },
                    axisPointer: { label: { formatter: params => params.value.toFixed(1) } }
                }],

                series: [
                    { name: "Teplota vnitřní", type: "line", data: timeLocal.map((t, i) => [t, F[0][i]]), smooth: 0.2, lineStyle: { width: 2 }, showSymbol: false },
                    { name: "Teplota vnější", type: "line", data: timeLocal.map((t, i) => [t, F[2][i]]), smooth: 0.2, lineStyle: { width: 2 }, showSymbol: false }
                ],

                toolbox: {
                    feature: {
                        restore: {},
                        saveAsImage: {}
                    }
                },

                media: [
                    {
                        query: { maxWidth: 850 },
                        option: { legend: { show: false } }
                    }
                ]
            };

            const option_temperature = {
                ...baseOption,

                title: { text: "Teplota", left: 10, top: 10, textStyle: { fontSize: 16 } },

                color: [
                    "#e74c3c", "#3498db", "#2ecc71", "#f1c40f",
                    "#c0392b", "#2980b9"
                ],

                series: [
                    ...baseOption.series,
                    { name: "Teplota podlaha", type: "line", data: timeLocal.map((t, i) => [t, F[4][i]]), smooth: 0.2, lineStyle: { width: 2 }, showSymbol: false },
                    { name: "Teplota strop", type: "line", data: timeLocal.map((t, i) => [t, F[5][i]]), smooth: 0.2, lineStyle: { width: 2 }, showSymbol: false },
                    { name: "Vytápění", type: "line", data: timeLocal.map((t, i) => [t, heaterSig[i]]), lineStyle: { width: 2 }, showSymbol: false },
                    { name: "Cirkulace", type: "line", data: timeLocal.map((t, i) => [t, fanSig[i]]), lineStyle: { width: 2 }, showSymbol: false }
                ]
            };

            chart_temperature.setOption(option_temperature);

            const option_humidity = {
                ...baseOption,

                title: { text: "Teplota a vlhkost", left: 10, top: 10, textStyle: { fontSize: 16 } },

                color: ["#e74c3c", "#c0392b", "#3498db", "#2980b9"],

                yAxis: [
                    baseOption.yAxis[0],
                    {
                        type: "value", name: "Vlhkost [%]", nameLocation: "middle",
                        min: value => minHumidity - 0.05 * rangeHumidity,
                        max: value => maxHumidity + 0.01 * rangeHumidity,
                        axisLabel: { showMinLabel: false, showMaxLabel: false },
                        splitLine: { show: false },
                        axisPointer: { label: { formatter: params => params.value.toFixed(1) } }
                    }
                ],

                series: [
                    ...baseOption.series,
                    { name: "Vlhkost vnitřní", type: "line", data: timeLocal.map((t, i) => [t, F[1][i]]), smooth: 0.2, lineStyle: { width: 2 }, showSymbol: false, yAxisIndex: 1 },
                    { name: "Vlhkost vnější", type: "line", data: timeLocal.map((t, i) => [t, F[3][i]]), smooth: 0.2, lineStyle: { width: 2 }, showSymbol: false, yAxisIndex: 1 }
                ]
            };
            chart_humidity.setOption(option_humidity);

            const option_illumination = {
                ...baseOption,

                title: { text: "Teplota a iIntenzita osvětlení", left: 10, top: 10, textStyle: { fontSize: 16 } },

                color: ["#e74c3c", "#c0392b", "#f1c40f"],

                yAxis: [
                    baseOption.yAxis[0],
                    {
                        type: "value", name: "Intenzita osvětlení [lx]", nameLocation: "middle",
                        min: value => minIllumination - 0.05 * rangeIllumination,
                        max: value => maxIllumination + 0.01 * rangeIllumination,
                        axisLabel: { showMinLabel: false, showMaxLabel: false },
                        splitLine: { show: false },
                        axisPointer: { label: { formatter: params => params.value.toFixed(1) } }
                    }
                ],

                series: [
                    ...baseOption.series,
                    { name: "Intenzita osvětlení", type: "line", data: timeLocal.map((t, i) => [t, F[6][i]]), smooth: 0.2, lineStyle: { width: 2 }, showSymbol: false, yAxisIndex: 1 },
                ]
            };
            chart_illumination.setOption(option_illumination);

            const option_pressure = {
                ...baseOption,

                title: { text: "Teplota a tlak", left: 10, top: 10, textStyle: { fontSize: 16 } },

                color: ["#e74c3c", "#c0392b", "#2ecc71"],

                yAxis: [
                    baseOption.yAxis[0],
                    {
                        type: "value", name: "Tlak vzduchu [hPa]", nameLocation: "middle",
                        min: value => minPressure - 0.05 * rangePressure,
                        max: value => maxPressure + 0.01 * rangePressure,
                        axisLabel: { showMinLabel: false, showMaxLabel: false },
                        splitLine: { show: false },
                        axisPointer: { label: { formatter: params => params.value.toFixed(1) } }
                    }
                ],

                series: [
                    ...baseOption.series,
                    { name: "Tlak vzduchu", type: "line", data: timeLocal.map((t, i) => [t, F[7][i]]), smooth: 0.2, lineStyle: { width: 2 }, showSymbol: false, yAxisIndex: 1 },
                ]
            };
            chart_pressure.setOption(option_pressure);

            spinner.classList.add("d-none");
        });
}

// ===============================
// PŘIZPŮSOBENÍ VELIKOSTI GRAFŮ PŘI ZMĚNĚ VELIKOSTI OKNA
// ===============================
function debounce(fn, delay) {
    let timeout;
    return function () {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, arguments), delay);
    };
}

window.addEventListener("load", () => {

    let lastWidth = window.innerWidth;

    const resizeCharts = () => {

        // Reagujeme jen na změnu šířky
        if (window.innerWidth === lastWidth) return;

        lastWidth = window.innerWidth;

        chart_temperature.resize();
        chart_humidity.resize();
        chart_illumination.resize();
        chart_pressure.resize();
    };

    window.addEventListener("resize", debounce(resizeCharts, 200));

    // Otočení telefonu — tady se šířka změní vždy
    window.addEventListener("orientationchange", () => {
        lastWidth = window.innerWidth;
        resizeCharts();
    });
});

// ===============================
// VYNULOVÁNÍ VALIDÁTORU PŘI ZMĚNĚ DATA
// ===============================
startInput.addEventListener("input", () => {
    endInput.setCustomValidity("");
});

endInput.addEventListener("input", () => {
    endInput.setCustomValidity("");
});

// ===============================
// NAČTENÍ DAT A VYKRESLENÍ GRAFŮ
// ===============================
function loadData(start, end) {
    fetchDataAndDraw(
        new Date(start).toISOString(),
        new Date(end).toISOString()
    );
}

const panel = document.getElementById('top-panel');

// ===============================
// RYCHLÉ VOLBY ČASOVÝCH ROZSAHŮ
// ===============================
document.querySelectorAll("#time-controls button[data-range]").forEach(btn => {
    btn.addEventListener("click", () => {

        spinner.classList.remove("d-none");

        const now = new Date();
        let start;

        switch (btn.dataset.range) {
            case "24h": start = new Date(Date.now() - 24 * 3600 * 1000); break;
            case "3d": start = new Date(Date.now() - 3 * 24 * 3600 * 1000); break;
            case "7d": start = new Date(Date.now() - 7 * 24 * 3600 * 1000); break;
            case "30d": start = new Date(Date.now() - 30 * 24 * 3600 * 1000); break;
        }

        // Zavřít panel
        wrap.classList.remove("open");

        loadData(start, now);
    });
});

// ===============================
// RUČNÍ VÝBĚR ČASOVÉHO ROZSAHU
// ===============================
document.getElementById("applyRange").addEventListener("click", () => {
    spinner.classList.remove("d-none");

    const startDate = document.getElementById("startInput").value;
    const endDate = document.getElementById("endInput").value;

    // HTML5 validace (required apod.)
    if (!startInput.reportValidity() || !endInput.reportValidity()) return;

    // Validace: konec nesmí být dříve než začátek
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (startDate && endDate && endDateObj < startDateObj) {
        endInput.setCustomValidity("Datum 'Do' nesmí být před datem 'Od'.");
        endInput.reportValidity();
        return;
    }

    // Nastavení časů intervalu
    startDateObj.setHours(0, 0, 0, 0);
    endDateObj.setHours(23, 59, 59, 999);

    // Zavřít panel
    wrap.classList.remove("open");

    // Spustit načtení dat
    loadData(startDateObj, endDateObj);
});

// ===============================
// VÝCHOZÍ ČASOVÝ ROZSAH – POSLEDNÍCH 24 HODIN
// ===============================
const now = new Date();
const start = new Date(Date.now() - 24 * 3600 * 1000);
loadData(start, now);

const wrap = document.getElementById('top-panel-wrap');
const tab = document.getElementById("panel-tab");

// ===============================
// OTEVŘENÍ / ZAVŘENÍ PANELU KLIKNUTÍM NA ZÁLOŽKU
// ===============================
tab.addEventListener("click", () => {
    wrap.classList.toggle('open');
});
