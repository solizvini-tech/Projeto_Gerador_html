"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const API = "";
  const state = { html: "", activeTab: "preview", history: [], busy: false };

  const els = {
    prompt: $("#prompt"), modification: $("#modification"), generateForm: $("#generate-form"),
    modifyForm: $("#modify-form"), generateButton: $("#btn-generate"), modifyButton: $("#btn-modify"),
    counter: $("#char-counter"), previewFrame: $("#preview-frame"), codeView: $("#code-view"),
    previewEmpty: $("#preview-empty"), previewLoading: $("#preview-loading"), loadingText: $("#loading-text"),
    tabPreview: $("#tab-preview"), tabCode: $("#tab-code"), copy: $("#btn-copy"), download: $("#btn-download"),
    new: $("#btn-new"), modifyFieldset: $("#modify-fieldset"), modifyHint: $("#modify-hint"),
    templates: $("#templates"), historyList: $("#history-list"), clearHistory: $("#btn-clear-history"), toast: $("#toast")
  };
  let toastTimer;

  const templates = [
    { icon: "▦", title: "Dashboard administrativo", description: "Painel com indicadores, gráficos e atividades recentes.", prompt: "Crie um dashboard administrativo moderno e responsivo com sidebar, cards de indicadores, gráfico de vendas, tabela de atividades recentes e filtros. Use HTML, CSS e JavaScript no mesmo arquivo." },
    { icon: "♙", title: "Cadastro de clientes", description: "Sistema para cadastrar, pesquisar e editar clientes.", prompt: "Crie um sistema de gerenciamento de clientes com formulário de cadastro, validação, busca em tempo real, edição e exclusão. Salve os dados no localStorage. Interface moderna e responsiva." },
    { icon: "🛒", title: "Loja virtual", description: "Vitrine de produtos com carrinho funcional.", prompt: "Crie uma loja virtual responsiva com catálogo de produtos, busca, filtros por categoria, carrinho funcional, alteração de quantidades e total da compra. Use produtos demonstrativos e localStorage." },
    { icon: "✓", title: "Lista de tarefas", description: "Organize tarefas, prazos e prioridades.", prompt: "Crie um gerenciador de tarefas com adicionar, concluir, editar e excluir tarefas, filtros de status, prioridades e salvamento no localStorage. Design limpo e responsivo." },
    { icon: "▤", title: "Landing page", description: "Página profissional para apresentar um negócio.", prompt: "Crie uma landing page profissional e responsiva para uma empresa de tecnologia, com hero, benefícios, serviços, depoimentos, planos e formulário de contato. Visual premium." },
    { icon: "▣", title: "Controle financeiro", description: "Registre receitas, despesas e saldo.", prompt: "Crie um aplicativo de controle financeiro pessoal com cadastro de receitas e despesas, categorias, saldo atualizado, resumo mensal, filtros e persistência localStorage. Interface responsiva." }
  ];

  function showToast(message, error = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle("error", error);
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200);
  }

  function setBusy(busy, button, label) {
    state.busy = busy;
    button.disabled = busy;
    const spinner = button.querySelector(".spinner");
    const text = button.querySelector(".btn-text");
    if (spinner) spinner.hidden = !busy;
    if (text) text.textContent = busy ? label : text.dataset.label;
    els.generateButton.disabled = busy;
    els.modifyButton.disabled = busy || !state.html;
  }

  function setLoading(show, message = "Gerando seu projeto…") {
    els.previewEmpty.hidden = true;
    els.previewFrame.hidden = true;
    els.codeView.hidden = true;
    els.previewLoading.hidden = !show;
    els.loadingText.textContent = message;
    if (!show && !state.html) els.previewEmpty.hidden = false;
  }

  function setProject(html) {
    state.html = html;
    els.previewFrame.srcdoc = html;
    els.codeView.querySelector("code").textContent = html;
    els.previewEmpty.hidden = true;
    els.previewLoading.hidden = true;
    els.copy.disabled = false;
    els.download.disabled = false;
    els.new.disabled = false;
    els.modifyFieldset.disabled = false;
    els.modifyHint.textContent = "Descreva o que deseja mudar no projeto atual.";
    els.modifyButton.disabled = false;
    switchTab(state.activeTab);
  }

  function switchTab(tab) {
    state.activeTab = tab;
    const preview = tab === "preview";
    els.tabPreview.setAttribute("aria-selected", String(preview));
    els.tabCode.setAttribute("aria-selected", String(!preview));
    els.previewFrame.hidden = !preview || !state.html;
    els.codeView.hidden = preview || !state.html;
    if (!state.html) els.previewEmpty.hidden = false;
  }

  async function historyRequest(path = "", options = {}) {
    let response;
    try { response = await fetch(`/api/projects${path}`, options); }
    catch { throw new Error("Não foi possível acessar o servidor para usar o histórico."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível acessar o histórico.");
    return data;
  }

  async function saveHistory(prompt, html) {
    await historyRequest("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, html }) });
    await loadHistory();
  }

  async function loadHistory() {
    const data = await historyRequest();
    state.history = data.projects;
    renderHistory();
  }

  function renderHistory() {
    els.historyList.replaceChildren();
    els.clearHistory.disabled = state.history.length === 0;
    if (!state.history.length) {
      const empty = document.createElement("li");
      empty.className = "history-empty";
      empty.textContent = "Seus projetos gerados aparecerão aqui.";
      els.historyList.append(empty);
      return;
    }
    state.history.forEach(item => {
      const li = document.createElement("li"); li.className = "history-item";
      const info = document.createElement("div"); info.className = "history-info";
      const title = document.createElement("strong"); title.textContent = item.prompt;
      const time = document.createElement("time");
      const date = new Date(item.date); time.dateTime = item.date;
      time.textContent = Number.isNaN(date.getTime()) ? "Data desconhecida" : date.toLocaleString("pt-BR");
      info.append(title, time);
      const actions = document.createElement("div"); actions.className = "history-actions";
      const open = document.createElement("button"); open.type = "button"; open.className = "btn btn-ghost btn-sm"; open.textContent = "Abrir";
      open.addEventListener("click", () => { setProject(item.html); els.prompt.value = item.prompt; updateCounter(); showToast("Projeto carregado do histórico."); });
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn-icon"; remove.textContent = "×"; remove.title = "Excluir do histórico"; remove.setAttribute("aria-label", "Excluir projeto do histórico");
      remove.addEventListener("click", async () => {
        if (!confirm("Excluir este projeto do histórico compartilhado?")) return;
        try { await historyRequest(`/${encodeURIComponent(item.id)}`, { method: "DELETE" }); await loadHistory(); showToast("Projeto excluído."); }
        catch (error) { showToast(error.message, true); }
      });
      actions.append(open, remove); li.append(info, actions); els.historyList.append(li);
    });
  }

  async function requestAI(endpoint, payload) {
    let response;
    try {
      response = await fetch(`${API}/api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch {
      throw new Error("Não foi possível acessar o backend. Abra um terminal na pasta do projeto, execute npm start e acesse http://localhost:3000.");
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : {};

    if (!response.ok) {
      if (response.status === 405) {
        throw new Error("Erro 405: o front-end está sendo servido por um servidor estático (como Live Server), não pelo backend do Divai. Execute npm start e abra http://localhost:3000.");
      }
      if (!contentType.includes("application/json")) {
        throw new Error(`O servidor respondeu ${response.status} sem JSON. Confirme que você abriu http://localhost:3000 usando npm start.`);
      }
      throw new Error(data.error || `Erro do servidor (${response.status}).`);
    }
    if (!data.html || typeof data.html !== "string") throw new Error("A IA não retornou um HTML válido. Tente novamente.");
    return data.html;
  }

  async function generate(prompt) {
    setBusy(true, els.generateButton, "Gerando…");
    setLoading(true, "A IA está construindo seu projeto…");
    try {
      const html = await requestAI("generate", { prompt });
      setProject(html);
      switchTab("preview");
      try { await saveHistory(prompt, html); showToast("Projeto gerado e salvo no histórico!"); }
      catch (error) { showToast(`Projeto gerado, mas não foi salvo: ${error.message}`, true); }
    } catch (error) {
      setLoading(false); showToast(error.message || "Falha ao gerar projeto.", true);
    } finally { setBusy(false, els.generateButton); }
  }

  async function modify(instruction) {
    setBusy(true, els.modifyButton, "Aplicando…");
    setLoading(true, "Aplicando as alterações solicitadas…");
    try {
      const html = await requestAI("modify", { html: state.html, instruction });
      setProject(html);
      switchTab("preview");
      const base = els.prompt.value.trim() || "Projeto atualizado";
      els.modification.value = "";
      try { await saveHistory(`${base} — ${instruction}`, html); showToast("Alterações aplicadas e salvas!"); }
      catch (error) { showToast(`Alterações aplicadas, mas não foram salvas: ${error.message}`, true); }
    } catch (error) {
      setLoading(false); showToast(error.message || "Falha ao alterar projeto.", true);
    } finally { setBusy(false, els.modifyButton); }
  }

  function updateCounter() { els.counter.textContent = `${els.prompt.value.length} / 2000 caracteres`; }

  function downloadHTML() {
    if (!state.html) return;
    const blob = new Blob([state.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "projeto-divai.html"; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast("Download iniciado.");
  }

  function newProject() {
    if (state.html && !confirm("Começar um novo projeto? Confira se ele foi salvo no histórico antes de continuar.")) return;
    state.html = ""; els.prompt.value = ""; els.modification.value = ""; updateCounter();
    els.previewFrame.removeAttribute("srcdoc"); els.codeView.querySelector("code").textContent = "";
    els.previewFrame.hidden = true; els.codeView.hidden = true; els.previewLoading.hidden = true; els.previewEmpty.hidden = false;
    els.copy.disabled = true; els.download.disabled = true; els.new.disabled = true; els.modifyFieldset.disabled = true;
    els.modifyHint.textContent = "Gere um projeto primeiro para poder alterá-lo."; els.modifyButton.disabled = true;
    switchTab("preview"); els.prompt.focus();
  }

  function renderTemplates() {
    els.templates.replaceChildren();
    templates.forEach(template => {
      const card = document.createElement("article"); card.className = "template-card";
      const icon = document.createElement("span"); icon.className = "template-icon"; icon.textContent = template.icon;
      const title = document.createElement("h3"); title.textContent = template.title;
      const description = document.createElement("p"); description.textContent = template.description;
      const button = document.createElement("button"); button.type = "button"; button.className = "btn btn-ghost btn-sm"; button.textContent = "Usar template";
      button.addEventListener("click", () => { els.prompt.value = template.prompt; updateCounter(); els.prompt.focus(); els.prompt.scrollIntoView({ behavior: "smooth", block: "center" }); showToast("Template carregado no campo de prompt."); });
      card.append(icon, title, description, button); els.templates.append(card);
    });
  }

  els.generateForm.addEventListener("submit", event => {
    event.preventDefault(); const prompt = els.prompt.value.trim();
    if (!prompt) return showToast("Descreva seu projeto antes de gerar.", true);
    generate(prompt);
  });
  els.modifyForm.addEventListener("submit", event => {
    event.preventDefault(); const instruction = els.modification.value.trim();
    if (!state.html) return showToast("Gere um projeto antes de alterá-lo.", true);
    if (!instruction) return showToast("Descreva as alterações desejadas.", true);
    modify(instruction);
  });
  els.prompt.addEventListener("input", updateCounter);
  els.tabPreview.addEventListener("click", () => switchTab("preview"));
  els.tabCode.addEventListener("click", () => switchTab("code"));
  els.copy.addEventListener("click", async () => {
    if (!state.html) return;
    try { await navigator.clipboard.writeText(state.html); showToast("Código copiado!"); }
    catch { const area = document.createElement("textarea"); area.value = state.html; document.body.append(area); area.select(); const ok = document.execCommand("copy"); area.remove(); showToast(ok ? "Código copiado!" : "Não foi possível copiar o código.", !ok); }
  });
  els.download.addEventListener("click", downloadHTML);
  els.new.addEventListener("click", newProject);
  els.clearHistory.addEventListener("click", async () => {
    if (!state.history.length || !confirm("Apagar todo o histórico compartilhado? Esta ação não pode ser desfeita.")) return;
    try { await historyRequest("", { method: "DELETE" }); await loadHistory(); showToast("Histórico apagado."); }
    catch (error) { showToast(error.message, true); }
  });

  // Efeitos visuais opcionais: não interferem nas funcionalidades do app.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!reduced && canHover) {
    const glow = $("#cursor-glow");
    if (glow) {
      let mx = innerWidth / 2, my = innerHeight / 2, gx = mx, gy = my;
      window.addEventListener("pointermove", e => { mx = e.clientX; my = e.clientY; }, { passive: true });
      const follow = () => { gx += (mx - gx) * .05; gy += (my - gy) * .05; glow.style.transform = `translate(${gx}px, ${gy}px)`; requestAnimationFrame(follow); };
      requestAnimationFrame(follow);
    }
    document.querySelectorAll(".card").forEach(card => card.addEventListener("pointermove", e => {
      const r = card.getBoundingClientRect(); card.style.setProperty("--mx", `${e.clientX-r.left}px`); card.style.setProperty("--my", `${e.clientY-r.top}px`);
    }, { passive: true }));
  }

  renderTemplates(); loadHistory().catch(error => showToast(error.message, true)); updateCounter();
  fetch("/api/health").then(r => r.json()).then(data => {
    if (!data.configured) showToast("Configure GROQ_API_KEY no arquivo .env para ativar a IA gratuita.", true);
  }).catch(() => showToast("Inicie o projeto pelo servidor Node.js (npm start), não abrindo o HTML diretamente.", true));
})();
