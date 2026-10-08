using System.Text.Json;
using MotionVideoPipeline.Orchestrator.M1;

namespace MotionVideoPipeline.App;

public sealed class MainForm : Form
{
    private static readonly Color Ink = ColorTranslator.FromHtml("#1D2939");
    private static readonly Color Muted = ColorTranslator.FromHtml("#667085");
    private static readonly Color Blue = ColorTranslator.FromHtml("#007AFF");
    private static readonly Color Surface = ColorTranslator.FromHtml("#F7F8FA");
    private readonly Label pageTitle = new();
    private readonly Label workerStatus = new();
    private readonly Panel content = new();
    private readonly DataGridView projectGrid = new();
    private readonly TextBox logBox = new();
    private CancellationTokenSource? runCancellation;
    private Task? runningTask;
    private NumericUpDown batchCount = new();
    private NumericUpDown minStars = new();
    private NumericUpDown excludeGeneratedDays = new();
    private TextBox languageFilter = new();
    private TextBox modelBaseUrl = new();
    private TextBox modelName = new();
    private TextBox apiKeyEnv = new();
    private ComboBox voice = new();
    private ComboBox bgmPolicy = new();
    private Button startButton = new();

    public MainForm()
    {
        Text = "MotionVideoPipeline · M1";
        MinimumSize = new Size(1180, 760);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.White;
        FormClosing += OnFormClosing;
        BuildLayout();
        ShowHome();
    }

    public void ActivateFromSecondInstance(string commandLine)
    {
        WindowState = FormWindowState.Normal;
        Show();
        Activate();
        if (!string.IsNullOrWhiteSpace(commandLine)) workerStatus.Text = $"已接收启动参数：{commandLine.Replace("\n", " ")}";
    }

    private void BuildLayout()
    {
        var nav = new Panel { Dock = DockStyle.Left, Width = 220, BackColor = Surface, Padding = new Padding(24, 28, 16, 24) };
        nav.Controls.Add(new Label { Text = "MOTION\nVIDEO PIPELINE", AutoSize = true, Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = Ink, Location = new Point(24, 24) });
        var items = new[] { ("项目", (Action)ShowHome), ("流程", (Action)ShowPipeline), ("内容", (Action)ShowContent), ("音色与音乐", (Action)ShowVoices), ("预览与质检", (Action)ShowPreview), ("设置", (Action)ShowSettings) };
        var y = 110;
        foreach (var item in items)
        {
            var button = new Button { Text = item.Item1, FlatStyle = FlatStyle.Flat, TextAlign = ContentAlignment.MiddleLeft, Width = 176, Height = 42, Location = new Point(20, y), ForeColor = Muted, BackColor = Color.Transparent, Font = new Font("Segoe UI", 10) };
            button.FlatAppearance.BorderSize = 0;
            button.Click += (_, _) => item.Item2();
            nav.Controls.Add(button);
            y += 44;
        }
        var header = new Panel { Dock = DockStyle.Top, Height = 82, Padding = new Padding(32, 25, 32, 16), BackColor = Color.White };
        pageTitle.AutoSize = true; pageTitle.Font = new Font("Segoe UI", 20, FontStyle.Bold); pageTitle.ForeColor = Ink; header.Controls.Add(pageTitle);
        workerStatus.AutoSize = true; workerStatus.Text = "单例已锁定 · Worker 未启动"; workerStatus.ForeColor = Muted; workerStatus.Location = new Point(32, 54); header.Controls.Add(workerStatus);
        content.Dock = DockStyle.Fill; content.Padding = new Padding(32, 12, 32, 24); content.BackColor = Color.White;
        var status = new StatusStrip(); status.Items.Add(new ToolStripStatusLabel("M1 · 固定 artifacts/MotionVideoPipeline.exe")); status.Items.Add(new ToolStripStatusLabel { Spring = true }); status.Items.Add(new ToolStripStatusLabel("1080×1920 · 30fps · ≤300秒"));
        Controls.Add(content); Controls.Add(header); Controls.Add(nav); Controls.Add(status);
    }

    private static Label LabelFor(string text, int x, int y) => new() { Text = text, AutoSize = true, ForeColor = Muted, Location = new Point(x, y) };
    private static TextBox TextInput(string value, int x, int y, int width = 260) => new() { Text = value, Width = width, Location = new Point(x, y), BorderStyle = BorderStyle.FixedSingle };

    private void ShowHome()
    {
        pageTitle.Text = "项目 · 周榜自动生产"; content.Controls.Clear();
        content.Controls.Add(LabelFor("固定来源", 0, 8)); content.Controls.Add(new Label { Text = GitHubTrendingSourceAdapter.Url, AutoSize = true, ForeColor = Ink, Location = new Point(100, 8) });
        content.Controls.Add(LabelFor("批量数量 N", 0, 52)); batchCount = new NumericUpDown { Minimum = 1, Maximum = 100, Value = 2, Width = 90, Location = new Point(100, 48) }; content.Controls.Add(batchCount);
        content.Controls.Add(LabelFor("最低 Star", 220, 52)); minStars = new NumericUpDown { Minimum = 0, Maximum = 1000000000, Increment = 100, Width = 120, Location = new Point(290, 48) }; content.Controls.Add(minStars);
        content.Controls.Add(LabelFor("语言过滤（逗号分隔）", 440, 52)); languageFilter = TextInput("", 590, 48, 180); content.Controls.Add(languageFilter);
        content.Controls.Add(LabelFor("排除已生成天数", 790, 52)); excludeGeneratedDays = new NumericUpDown { Minimum = 0, Maximum = 3650, Value = 30, Width = 80, Location = new Point(900, 48) }; content.Controls.Add(excludeGeneratedDays);
        content.Controls.Add(LabelFor("领域包", 0, 96)); content.Controls.Add(new Label { Text = "github-open-source（产品内置）", AutoSize = true, ForeColor = Ink, Location = new Point(100, 96) });
        content.Controls.Add(LabelFor("模型 Base URL", 0, 140)); modelBaseUrl = TextInput(ConfiguredEnvironment("MVP_LLM_BASE_URL"), 100, 136, 300); content.Controls.Add(modelBaseUrl);
        content.Controls.Add(LabelFor("模型", 420, 140)); modelName = TextInput(ConfiguredEnvironment("MVP_LLM_MODEL"), 470, 136, 220); content.Controls.Add(modelName);
        content.Controls.Add(LabelFor("Key 环境变量", 710, 140)); apiKeyEnv = TextInput("MVP_LLM_API_KEY", 800, 136, 180); content.Controls.Add(apiKeyEnv);
        content.Controls.Add(LabelFor("音色", 0, 184)); voice = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 160, Location = new Point(100, 180) }; voice.Items.Add("zf_001 · 中文女声"); voice.SelectedIndex = 0; content.Controls.Add(voice);
        content.Controls.Add(LabelFor("BGM 策略", 290, 184)); bgmPolicy = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 180, Location = new Point(370, 180) }; bgmPolicy.Items.AddRange(["自动，无 BGM 也继续", "仅有 BGM 才导出"]); bgmPolicy.SelectedIndex = 0; content.Controls.Add(bgmPolicy);
        startButton = new Button { Text = "开始自动生产", Width = 170, Height = 40, Location = new Point(0, 236), BackColor = Blue, ForeColor = Color.White, FlatStyle = FlatStyle.Flat }; startButton.Click += async (_, _) => await StartBatchAsync(); content.Controls.Add(startButton);
        content.Controls.Add(new Label { Text = "资料、核验、讲稿、配音、动画、字幕、质检和导出由流水线自动完成；模型配置缺失时真实任务会阻断。", AutoSize = true, ForeColor = Muted, Location = new Point(190, 249) });
        projectGrid.Location = new Point(0, 300); projectGrid.Width = Math.Max(800, content.ClientSize.Width - 32); projectGrid.Height = 260; projectGrid.ReadOnly = true; projectGrid.AllowUserToAddRows = false; projectGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill; projectGrid.BackgroundColor = Color.White; content.Controls.Add(projectGrid);
        logBox.Location = new Point(0, 570); logBox.Width = Math.Max(800, content.ClientSize.Width - 32); logBox.Height = 90; logBox.Multiline = true; logBox.ScrollBars = ScrollBars.Vertical; logBox.ReadOnly = true; logBox.BackColor = Color.White; content.Controls.Add(logBox);
    }

    private async Task StartBatchAsync()
    {
        if (runningTask is not null) return;
        startButton.Enabled = false; runCancellation = new CancellationTokenSource();
        var taskId = $"batch-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";
        var workspace = FindWorkspaceRoot(); var artifacts = Path.Combine(workspace, "artifacts");
        var languages = languageFilter.Text.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var generatedDates = CandidateSelector.LoadCompletedRunDates(artifacts);
        var options = new WeeklyBatchOptions(taskId, (int)batchCount.Value, new CandidateFilter(languages, (long)minStars.Value, new HashSet<string>(), new HashSet<string>(), new HashSet<string>(), new HashSet<string>(), GeneratedRepositoryDates: generatedDates, ExcludeGeneratedWithinDays: (int)excludeGeneratedDays.Value), ProjectConcurrency: 3);
        var apiKeyName = apiKeyEnv.Text.Trim();
        if (!string.IsNullOrWhiteSpace(apiKeyName) && string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(apiKeyName)))
        {
            var userKey = Environment.GetEnvironmentVariable(apiKeyName, EnvironmentVariableTarget.User);
            if (!string.IsNullOrWhiteSpace(userKey)) Environment.SetEnvironmentVariable(apiKeyName, userKey);
        }
        var model = JsonSerializer.SerializeToElement(new { profileId = "default-content-model", baseUrl = modelBaseUrl.Text.Trim(), apiKeyEnvVar = apiKeyName, model = modelName.Text.Trim(), timeoutSeconds = 90, maxRetries = 3 });
        var concurrencyGates = new M1ConcurrencyGates(sourceCollectionConcurrency: 3, aiPlanningConcurrency: 2, renderingConcurrency: 1);
        var runOptions = new M1RunOptions(workspace, artifacts, Path.Combine(workspace, "voice-catalog.json"), Path.Combine(artifacts, "voice-cache"), VoiceIdFromSelection(), ModelProfile: model, ConcurrencyGates: concurrencyGates);
        projectGrid.DataSource = null; logBox.Clear(); workerStatus.Text = "周榜采集中 · 等待 Worker";
        var orchestrator = new WeeklyBatchOrchestrator(); var runner = new M1PipelineRunner();
        runningTask = Task.Run(async () =>
        {
            try
            {
                var result = await orchestrator.RunAsync(options, async (project, projectId, token) => { UpdateStatus($"正在处理 {project.ProjectName}"); var projectResult = await runner.RunProjectAsync(project, projectId, runOptions, token); AppendLog($"{project.ProjectName}: {projectResult.Status}"); }, runCancellation.Token);
                UpdateProjects(result.State); UpdateStatus($"批量任务 {result.State.Status}"); AppendLog($"榜单来源：{result.Snapshot.SourceUrl}\n快照：{result.SnapshotPath}");
            }
            catch (OperationCanceledException) { UpdateStatus("批量任务已取消"); }
            catch (Exception error) { AppendLog($"任务失败：{error.Message}"); UpdateStatus("批量任务失败"); }
            finally { concurrencyGates.Dispose(); BeginInvoke(() => { startButton.Enabled = true; runningTask = null; runCancellation?.Dispose(); runCancellation = null; }); }
        });
        await Task.CompletedTask;
    }

    private string VoiceIdFromSelection() => voice.SelectedItem?.ToString()?.Split('·')[0].Trim() ?? "zf_001";
    private static string ConfiguredEnvironment(string name) => Environment.GetEnvironmentVariable(name) ?? Environment.GetEnvironmentVariable(name, EnvironmentVariableTarget.User) ?? "";
    private string FindWorkspaceRoot() { var directory = new DirectoryInfo(AppContext.BaseDirectory); while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "voice-catalog.json"))) directory = directory.Parent!; return directory?.FullName ?? AppContext.BaseDirectory; }
    private void UpdateStatus(string text) { if (IsDisposed) return; BeginInvoke(() => workerStatus.Text = text); }
    private void AppendLog(string text) { if (IsDisposed) return; BeginInvoke(() => logBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {text}\r\n")); }
    private void UpdateProjects(BatchTaskState state) { if (IsDisposed) return; BeginInvoke(() => projectGrid.DataSource = state.Projects.Select(x => new { x.ProjectId, x.RepositoryUrl, Status = x.Status.ToString(), x.Error }).ToList()); }

    private void ShowPipeline() { pageTitle.Text = "流程"; content.Controls.Clear(); content.Controls.Add(new Label { Text = "周榜 → 资料 → 证据 → 五格讲稿 → Kokoro → 字幕 → CanvasWorld → 质检 → 导出", AutoSize = true, ForeColor = Ink, Location = new Point(0, 12) }); content.Controls.Add(new Label { Text = "每个 ProjectRun 独立推进；失败项目进入 quarantine，不阻塞其他项目。", AutoSize = true, ForeColor = Muted, Location = new Point(0, 52) }); }
    private void ShowContent() { pageTitle.Text = "内容"; content.Controls.Clear(); content.Controls.Add(new Label { Text = "五格故事板：开场 | 原理 | 案例 | 应用 | 结论（hook 只在结论最后一个 beat）", AutoSize = true, ForeColor = Ink, Location = new Point(0, 12) }); content.Controls.Add(new Label { Text = "EvidencePack、讲稿、发音文本、字幕和 visualActions 在 runs/{projectId}/ 中持久化。", AutoSize = true, ForeColor = Muted, Location = new Point(0, 52) }); }
    private void ShowVoices() { pageTitle.Text = "音色与音乐"; content.Controls.Clear(); content.Controls.Add(new Label { Text = "所有显式音色在配音前预缓存；试听仅读取本地 previewAudioPath。", AutoSize = true, ForeColor = Muted, Location = new Point(0, 12) }); content.Controls.Add(new DataGridView { Location = new Point(0, 56), Width = 780, Height = 180, ReadOnly = true, AllowUserToAddRows = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, DataSource = new[] { new { VoiceId = "zf_001", DisplayName = "中文女声 · ZF 001", Status = "由 VoiceCatalogPreloader 检查" } } }); content.Controls.Add(new Label { Text = "BGM 缺失时自动无 BGM 导出，并在 quality-report.json 写入 warning。", AutoSize = true, ForeColor = Muted, Location = new Point(0, 260) }); }
    private void ShowPreview() { pageTitle.Text = "预览与质检"; content.Controls.Clear(); var canvas = new Panel { Width = 324, Height = 576, Location = new Point(0, 10), BackColor = ColorTranslator.FromHtml("#050816"), BorderStyle = BorderStyle.FixedSingle }; canvas.Paint += (_, e) => { using var pen = new Pen(ColorTranslator.FromHtml("#4CC9F0"), 1); e.Graphics.DrawRectangle(pen, 22, 48, 280, 480); e.Graphics.DrawString("CanvasWorld\n1080×1920", new Font("Segoe UI", 12), Brushes.White, 105, 270); }; content.Controls.Add(canvas); content.Controls.Add(new Label { Text = "安全区：x=72..1008，顶部刘海避让；质量报告检查尺寸、帧率、字幕、证据、发音和音频峰值。", AutoSize = true, ForeColor = Muted, Location = new Point(350, 28) }); }
    private void ShowSettings() { pageTitle.Text = "设置"; content.Controls.Clear(); content.Controls.Add(new Label { Text = "运行环境与发布", AutoSize = true, Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = Ink, Location = new Point(0, 10) }); content.Controls.Add(new Label { Text = "Node.js / Python / Kokoro / Remotion / FFmpeg 使用新项目独立配置；缺失项由环境诊断报告，不从旧项目复制。", AutoSize = true, ForeColor = Muted, Location = new Point(0, 52) }); content.Controls.Add(new Label { Text = Path.Combine(FindWorkspaceRoot(), "artifacts", "MotionVideoPipeline.exe"), AutoSize = true, ForeColor = Ink, Location = new Point(0, 112) }); }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (runningTask is null) return;
        var choice = MessageBox.Show(this, "当前有批量任务正在运行。是：取消并等待 Worker 退出；否：后台运行；取消：返回。", "任务运行中", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
        if (choice == DialogResult.Cancel) { e.Cancel = true; return; }
        if (choice == DialogResult.Yes) { runCancellation?.Cancel(); try { runningTask.GetAwaiter().GetResult(); } catch { } }
        e.Cancel = false;
    }
}
