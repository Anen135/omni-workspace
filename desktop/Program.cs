using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace OmniDesktop {
internal static class Program {
    [STAThread] static void Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Workspace(Array.IndexOf(args, "--dev") >= 0, Array.IndexOf(args, "--smoke-test") >= 0));
    }
}

internal sealed class Workspace : Form {
    const string Official = "https://omni.top-academy.ru";
    const string Published = "https://anen135.github.io/omni-workspace/";
    readonly string uiUrl;
    readonly WebView2 ui = new WebView2 { Dock = DockStyle.Fill };
    readonly WebView2 omni = new WebView2 { Dock = DockStyle.Fill };
    readonly Form login = new Form { Text = "Официальный вход — omni.top-academy.ru", Width = 1000, Height = 780 };
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
    readonly HashSet<string> actions = new HashSet<string> { "connect", "status", "snapshot", "lesson", "group", "student", "materials-catalog", "method-package", "file-preview" };
    readonly Dictionary<string, TaskCompletionSource<object>> pending = new Dictionary<string, TaskCompletionSource<object>>();
    string agent;
    bool initialized;
    Task opening;
    bool busy;
    int generation;

    public Workspace(bool dev, bool smoke) {
        uiUrl = dev ? "http://127.0.0.1:5173/" : Published;
        Text = "Omni Workspace — desktop prototype"; Width = 1440; Height = 950; MinimumSize = new Size(800, 600);
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 40 };
        var signIn = new Button { Text = "Официальный вход", AutoSize = true };
        var retry = new Button { Text = "Обновить интерфейс", AutoSize = true };
        signIn.Click += async (s, e) => { try { await OpenLogin(); } catch { ShowFailure(); } };
        retry.Click += (s, e) => { if (ui.CoreWebView2 != null) ui.CoreWebView2.Navigate(uiUrl); };
        toolbar.Controls.Add(signIn); toolbar.Controls.Add(retry);
        Controls.Add(ui); Controls.Add(toolbar); login.Controls.Add(omni);
        login.FormClosing += (s, e) => { if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; login.Hide(); } };
        FormClosed += (s, e) => { foreach (var item in pending.Values) item.TrySetCanceled(); login.Dispose(); };
        if (smoke) { Opacity = 0; ShowInTaskbar = false; login.Opacity = 0; login.ShowInTaskbar = false; }
        Shown += async (s, e) => {
            try {
                await InitializeUi();
                if (smoke) {
                    await SmokeTest();
                    File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "smoke-result.json"), json.Serialize(new { success = true, uiBridge = true, officialState = smokeState }));
                }
            } catch (Exception error) { if (smoke) { Environment.ExitCode = 1; File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "smoke-result.json"), json.Serialize(new { success = false, stage = smokeStage, errorType = error.GetType().Name, navigation = navigationStatus })); } else ShowFailure(); }
            finally { if (smoke) Close(); }
        };
    }
    string smokeState;
    string smokeStage = "initialize-ui";
    string navigationStatus;
    async Task SmokeTest() {
        smokeStage = "origin-policy";
        if (TrustedUi("https://evil.test/omni-workspace/") || TrustedUi("https://anen135.github.io/other-project/") || TrustedOmni("https://omni.top-academy.ru.evil.test/")) throw new InvalidOperationException();
        smokeStage = "ui-ready";
        for (var n = 0; n < 40; n++) {
            if (await ui.ExecuteScriptAsync("!!window.__OMNI_DESKTOP__ && document.readyState === 'complete'") == "true") break;
            await Task.Delay(250);
        }
        smokeStage = "ui-bridge";
        await ui.ExecuteScriptAsync("window.chrome.webview.addEventListener('message',e=>{if(e.data.id==='smoke')window.__smokeResult=e.data.result});window.chrome.webview.postMessage({id:'smoke',action:'status',input:{}})");
        var connected = false;
        for (var n = 0; n < 40; n++) {
            if (await ui.ExecuteScriptAsync("window.__smokeResult?.data?.state === 'disconnected'") == "true") { connected = true; break; }
            await Task.Delay(250);
        }
        if (!connected) throw new InvalidOperationException();
        smokeStage = "reject-command";
        await ui.ExecuteScriptAsync("window.__smokeResult=null;window.chrome.webview.postMessage({id:'smoke',action:'execute-arbitrary-script',input:{}})");
        await Task.Delay(300);
        if (await ui.ExecuteScriptAsync("window.__smokeResult?.error?.code === 'DESKTOP_ERROR'") != "true") throw new InvalidOperationException();
        smokeStage = "official-load";
        await OpenLogin();
        smokeStage = "official-status";
        var result = await Execute("status", new Dictionary<string, object>());
        var parsed = json.Deserialize<Dictionary<string, object>>(json.Serialize(result));
        var data = parsed["data"] as Dictionary<string, object>;
        smokeState = data["state"] as string;
        if (smokeState != "login" && smokeState != "challenge" && smokeState != "ready") throw new InvalidOperationException();
    }

    bool TrustedUi(string value) {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)) return false;
        var expected = new Uri(uiUrl);
        return uri.GetLeftPart(UriPartial.Authority) == expected.GetLeftPart(UriPartial.Authority)
            && uri.AbsolutePath.StartsWith(expected.AbsolutePath, StringComparison.Ordinal) && uri.UserInfo == "";
    }
    static bool TrustedOmni(string value) {
        return Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.GetLeftPart(UriPartial.Authority) == Official && uri.UserInfo == "";
    }
    static string Profile(string name) {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OmniWorkspace", name);
    }
    static void Harden(WebView2 view) {
        view.CoreWebView2.Settings.AreHostObjectsAllowed = false;
        view.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
        view.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
        view.CoreWebView2.NewWindowRequested += (s, e) => { e.Handled = true; };
        view.CoreWebView2.PermissionRequested += (s, e) => { e.State = CoreWebView2PermissionState.Deny; };
    }
    async Task InitializeUi() {
        await ui.EnsureCoreWebView2Async(await CoreWebView2Environment.CreateAsync(null, Profile("interface")));
        Harden(ui);
        ui.CoreWebView2.NavigationStarting += (s, e) => { generation++; if (!TrustedUi(e.Uri)) e.Cancel = true; };
        ui.CoreWebView2.WebMessageReceived += OnUiMessage;
        var trusted = json.Serialize(new Uri(uiUrl).GetLeftPart(UriPartial.Authority));
        var path = json.Serialize(new Uri(uiUrl).AbsolutePath);
        await ui.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
          if (window === window.top && location.origin === " + trusted + @" && location.pathname.startsWith(" + path + @")) {
            Object.defineProperty(window, '__OMNI_DESKTOP__', { value: Object.freeze({ version: 1 }), writable: false });
          }");
        ui.CoreWebView2.Navigate(uiUrl);
    }
    async Task OpenLogin() {
        login.Show(this); login.Activate();
        if (initialized) return;
        if (opening != null) { await opening; return; }
        try { opening = InitializeOfficial(); await opening; }
        finally { opening = null; }
    }
    async Task InitializeOfficial() {
        await omni.EnsureCoreWebView2Async(await CoreWebView2Environment.CreateAsync(null, Profile("omni")));
        Harden(omni);
        omni.CoreWebView2.NavigationStarting += (s, e) => {
            if (!TrustedOmni(e.Uri)) { e.Cancel = true; navigationStatus = "blocked-origin:" + new Uri(e.Uri).Host; }
            foreach (var item in pending.Values) item.TrySetException(new InvalidOperationException("Navigation changed"));
        };
        omni.CoreWebView2.WebMessageReceived += (s, e) => {
            if (!TrustedOmni(e.Source) || !TrustedOmni(omni.Source?.AbsoluteUri)) return;
            try {
                var message = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
                if (message.TryGetValue("id", out var id) && id is string key && pending.TryGetValue(key, out var completion)) completion.TrySetResult(message["result"]);
            } catch { /* Ignore unsolicited messages from the official page. */ }
        };
        using (var reader = new StreamReader(Assembly.GetExecutingAssembly().GetManifestResourceStream("agent.js"))) agent = reader.ReadToEnd();
        var loaded = new TaskCompletionSource<bool>();
        EventHandler<CoreWebView2NavigationCompletedEventArgs> handler = (s, e) => { navigationStatus = e.WebErrorStatus.ToString() + ":" + e.HttpStatusCode; loaded.TrySetResult(e.IsSuccess || e.HttpStatusCode == 403); };
        omni.CoreWebView2.NavigationCompleted += handler;
        try {
            omni.CoreWebView2.Navigate(Official + "/login/index");
            if (await Task.WhenAny(loaded.Task, Task.Delay(45000)) != loaded.Task || !await loaded.Task) throw new InvalidOperationException();
            initialized = true;
        } finally { omni.CoreWebView2.NavigationCompleted -= handler; }
    }
    async Task<object> Execute(string action, object input) {
        if (!initialized) {
            if (action == "status") return new { connected = false, state = "disconnected" };
            throw new InvalidOperationException("Open login first");
        }
        if (!TrustedOmni(omni.Source?.AbsoluteUri)) throw new InvalidOperationException();
        var id = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<object>();
        pending.Add(id, completion);
        try {
            var request = json.Serialize(new { action, input });
            // Fixed bundled code and JSON values only: the frontend cannot supply scripts or URLs.
            await omni.ExecuteScriptAsync("if (location.origin === '" + Official + "') {" + agent +
                ";(async()=>{const q=" + request + ";let result;try{result={data:await OmniDesktopAgent.dispatch(q.action,q.input)}}catch(e){result={error:{code:e.code||'DESKTOP_ERROR',message:e.code?e.message:'Не удалось выполнить запрос Omni.'}}}window.chrome.webview.postMessage({id:" + json.Serialize(id) + ",result});})()} ");
            if (await Task.WhenAny(completion.Task, Task.Delay(180000)) != completion.Task) throw new TimeoutException();
            return await completion.Task;
        } finally { pending.Remove(id); }
    }
    async void OnUiMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e) {
        if (!TrustedUi(e.Source) || !TrustedUi(ui.Source?.AbsoluteUri) || e.WebMessageAsJson.Length > 8192) return;
        var epoch = generation;
        string id = null;
        bool acquired = false;
        object result;
        try {
            var message = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
            id = message["id"] as string;
            if (id == null || id.Length > 80) return;
            var action = message["action"] as string;
            if (action == null || !actions.Contains(action)) throw new InvalidOperationException();
            if (busy) { Reply(id, new { error = new { code = "BUSY", message = "Дождитесь завершения текущего запроса." } }, epoch); return; }
            busy = true; acquired = true;
            if (action == "connect") await OpenLogin();
            if (action == "file-preview") {
                try {
                    var fileInput = message["input"] as Dictionary<string, object>;
                    if (fileInput == null || fileInput.Count != 1) throw new InvalidOperationException();
                    result = new { data = await PreviewFiles.Load(fileInput["url"] as string) };
                } catch { result = new { error = new { code = "FILE_PREVIEW", message = "Не удалось загрузить превью. В desktop-прототипе поддерживаются PDF и изображения до 8 МБ." } }; }
            }
            else if (action == "status" && !initialized) result = new { data = new { connected = false, state = "disconnected" } };
            else result = await Execute(action, message.TryGetValue("input", out var input) ? input : new Dictionary<string, object>());
        } catch {
            result = new { error = new { code = "DESKTOP_ERROR", message = "Не удалось выполнить запрос. Откройте официальный вход и повторите." } };
        } finally { if (acquired) busy = false; }
        if (id != null) Reply(id, result, epoch);
    }
    void Reply(string id, object result, int epoch) {
        try { if (!IsDisposed && epoch == generation && TrustedUi(ui.Source?.AbsoluteUri)) ui.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { id, result })); }
        catch (InvalidOperationException) { /* Window closed or navigated while replying. */ }
        catch (System.Runtime.InteropServices.COMException) { /* WebView is shutting down. */ }
    }
    void ShowFailure() { MessageBox.Show(this, "Не удалось запустить WebView2 или открыть сайт. Проверьте подключение и наличие Microsoft Edge WebView2 Runtime. Для локальной проверки запустите npm run dev и Omni.Desktop.exe --dev.", "Omni Workspace"); }
}
}
