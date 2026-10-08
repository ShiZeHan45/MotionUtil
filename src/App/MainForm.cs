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
    private Control? activePage;
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
        AutoScaleMode = AutoScaleMode.Dpi;
        MinimumSize = new Size(960, 680);
        Size = new Size(1280, 820);
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
        var nav = new Panel { Dock = DockStyle.Left, Width = 208, BackColor = Surface, Padding = new Padding(18, 24, 14, 20) };
        var brand = new Label { Text = "MOTION\nVIDEO PIPELINE", Dock = DockStyle.Top, Height = 62, Font = new Font("Segoe UI", 13, FontStyle.Bold), ForeColor = Ink };
        var navList = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0, 14, 0, 0), BackColor = Color.Transparent };
        nav.Controls.Add(navList);
        nav.Controls.Add(brand);
        var items = new[] { ("项目", (Action)ShowHome), ("流程", (Action)ShowPipeline), ("内容", (Action)ShowContent), ("音色与音乐", (Action)ShowVoices), ("预览与质检", (Action)ShowPreview), ("设置", (Action)ShowSettings) };
        foreach (var item in items)
        {
            var button = new Button { Text = item.Item1, FlatStyle = FlatStyle.Flat, TextAlign = ContentAlignment.MiddleLeft, Width = 170, Height = 42, Margin = new Padding(0, 0, 0, 4), ForeColor = Muted, BackColor = Color.Transparent, Font = new Font("Segoe UI", 10) };
            button.FlatAppearance.BorderSize = 0;
            button.Click += (_, _) => item.Item2();
            navList.Controls.Add(button);
        }
        nav.Resize += (_, _) =>
        {
            foreach (Control control in navList.Controls) control.Width = Math.Max(120, navList.ClientSize.Width - navList.Padding.Horizontal - 2);
        };

        var header = new TableLayoutPanel { Dock = DockStyle.Top, Height = 84, ColumnCount = 1, RowCount = 2, Padding = new Padding(24, 14, 24, 8), BackColor = Color.White };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        header.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        pageTitle.Dock = DockStyle.Fill; pageTitle.Font = new Font("Segoe UI", 20, FontStyle.Bold); pageTitle.ForeColor = Ink; pageTitle.AutoEllipsis = true;
        workerStatus.Dock = DockStyle.Fill; workerStatus.Text = "单例已锁定 · Worker 未启动"; workerStatus.ForeColor = Muted; workerStatus.AutoEllipsis = true;
        header.Controls.Add(pageTitle, 0, 0); header.Controls.Add(workerStatus, 0, 1);

        content.Dock = DockStyle.Fill; content.Padding = new Padding(24, 12, 24, 20); content.BackColor = Color.White; content.AutoScroll = true;
        content.Resize += (_, _) => ResizeActivePage();
        var status = new StatusStrip();
        status.Items.Add(new ToolStripStatusLabel("M1 · artifacts/MotionVideoPipeline.exe") { Spring = true, TextAlign = ContentAlignment.MiddleLeft });
        status.Items.Add(new ToolStripStatusLabel("1080×1920 · 30fps") { Spring = false });
        Controls.Add(content); Controls.Add(header); Controls.Add(nav); Controls.Add(status);
    }

    private static Label BlockLabel(string text, Color color, int height) => new() { Text = text, AutoSize = false, Dock = DockStyle.Fill, Height = height, ForeColor = color, Padding = new Padding(0, 4, 0, 4), UseCompatibleTextRendering = true };

    private static Panel FieldGroup(string labelText, Control input, int width = 280)
    {
        var field = new Panel { Width = width, Height = 64, Margin = new Padding(0, 4, 16, 4) };
        var label = new Label { Text = labelText, AutoSize = false, AutoEllipsis = true, Width = width, Height = 20, ForeColor = Muted, Location = new Point(0, 0) };
        input.Location = new Point(0, 24);
        input.Width = width;
        input.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top;
        field.Controls.Add(input);
        field.Controls.Add(label);
        return field;
    }

    private static TableLayoutPanel PageTable(int rows)
    {
        var page = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, ColumnCount = 1, RowCount = rows, Margin = new Padding(0), Padding = new Padding(0) };
        page.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (var i = 0; i < rows; i++) page.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        return page;
    }

    private void ResetPage()
    {
        content.SuspendLayout();
        content.Controls.Clear();
        activePage = null;
        content.AutoScrollPosition = Point.Empty;
        content.ResumeLayout(true);
    }

    private void AttachPage(Control page)
    {
        page.Dock = DockStyle.Top;
        page.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        activePage = page;
        content.Controls.Add(page);
        ResizeActivePage();
        page.BringToFront();
    }

    private void ResizeActivePage()
    {
        if (activePage is null || content.ClientSize.Width <= 0) return;
        var scrollbarWidth = content.VerticalScroll.Visible ? SystemInformation.VerticalScrollBarWidth : 0;
        activePage.Width = Math.Max(0, content.ClientSize.Width - content.Padding.Horizontal - scrollbarWidth);
    }

    private void ShowHome()
    {
        pageTitle.Text = "项目 · 周榜自动生产";
        ResetPage();
        var page = PageTable(5);
        var source = new TableLayoutPanel { Dock = DockStyle.Fill, Height = 34, ColumnCount = 2, Margin = new Padding(0, 0, 0, 8) };
        source.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 84)); source.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        source.Controls.Add(new Label { Text = "固定来源", Dock = DockStyle.Fill, ForeColor = Muted, TextAlign = ContentAlignment.MiddleLeft }, 0, 0);
        source.Controls.Add(new Label { Text = GitHubTrendingSourceAdapter.Url, Dock = DockStyle.Fill, AutoEllipsis = true, ForeColor = Ink, TextAlign = ContentAlignment.MiddleLeft }, 1, 0);
        page.Controls.Add(source, 0, 0);

        var fields = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, FlowDirection = FlowDirection.LeftToRight, WrapContents = true, Margin = new Padding(0), Padding = new Padding(0, 0, 0, 8) };
        batchCount = new NumericUpDown { Minimum = 1, Maximum = 100, Value = 2, Width = 110 };
        minStars = new NumericUpDown { Minimum = 0, Maximum = 1000000000, Increment = 100, Width = 140, ThousandsSeparator = true };
        languageFilter = new TextBox { Width = 280, BorderStyle = BorderStyle.FixedSingle };
        excludeGeneratedDays = new NumericUpDown { Minimum = 0, Maximum = 3650, Value = 30, Width = 120 };
        var domain = new Label { Text = "github-open-source（产品内置）", BorderStyle = BorderStyle.FixedSingle, TextAlign = ContentAlignment.MiddleLeft, AutoEllipsis = true, Height = 24 };
        modelBaseUrl = new TextBox { Text = ConfiguredEnvironment("MVP_LLM_BASE_URL"), Width = 360, BorderStyle = BorderStyle.FixedSingle };
        modelName = new TextBox { Text = ConfiguredEnvironment("MVP_LLM_MODEL"), Width = 280, BorderStyle = BorderStyle.FixedSingle };
        apiKeyEnv = new TextBox { Text = "MVP_LLM_API_KEY", Width = 280, BorderStyle = BorderStyle.FixedSingle };
        voice = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 280 }; voice.Items.Add("zf_001 · 中文女声"); voice.SelectedIndex = 0;
        bgmPolicy = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 280 }; bgmPolicy.Items.AddRange(["自动，无 BGM 也继续", "仅有 BGM 才导出"]); bgmPolicy.SelectedIndex = 0;
        fields.Controls.Add(FieldGroup("批量数量 N", batchCount)); fields.Controls.Add(FieldGroup("最低 Star", minStars));
        fields.Controls.Add(FieldGroup("语言过滤（逗号分隔）", languageFilter)); fields.Controls.Add(FieldGroup("排除已生成天数", excludeGeneratedDays));
        fields.Controls.Add(FieldGroup("领域包", domain)); fields.Controls.Add(FieldGroup("模型 Base URL", modelBaseUrl, 360));
        fields.Controls.Add(FieldGroup("模型", modelName)); fields.Controls.Add(FieldGroup("Key 环境变量", apiKeyEnv));
        fields.Controls.Add(FieldGroup("音色", voice)); fields.Controls.Add(FieldGroup("BGM 策略", bgmPolicy));
        page.Controls.Add(fields, 0, 1);

        var startRow = new TableLayoutPanel { Dock = DockStyle.Fill, Height = 58, ColumnCount = 2, Margin = new Padding(0, 4, 0, 10) };
        startRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180)); startRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        startButton = new Button { Text = "开始自动生产", Dock = DockStyle.Fill, BackColor = Blue, ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Margin = new Padding(0, 4, 12, 4) };
        startButton.Click += async (_, _) => await StartBatchAsync(); startRow.Controls.Add(startButton, 0, 0);
        startRow.Controls.Add(BlockLabel("资料、核验、讲稿、配音、动画、字幕、质检和导出由流水线自动完成；模型配置缺失时真实任务会阻断。", Muted, 50), 1, 0);
        page.Controls.Add(startRow, 0, 2);

        projectGrid.Dock = DockStyle.Fill; projectGrid.ReadOnly = true; projectGrid.AllowUserToAddRows = false; projectGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill; projectGrid.BackgroundColor = Color.White; projectGrid.RowHeadersVisible = false; projectGrid.Margin = new Padding(0, 0, 0, 10);
        page.RowStyles[3] = new RowStyle(SizeType.Absolute, 260); page.Controls.Add(projectGrid, 0, 3);
        logBox.Dock = DockStyle.Fill; logBox.Multiline = true; logBox.ScrollBars = ScrollBars.Vertical; logBox.ReadOnly = true; logBox.BackColor = Color.White; logBox.Margin = new Padding(0);
        page.RowStyles[4] = new RowStyle(SizeType.Absolute, 110); page.Controls.Add(logBox, 0, 4);
        AttachPage(page);
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

    private void ShowPipeline()
    {
        pageTitle.Text = "流程"; ResetPage();
        var page = PageTable(2);
        page.Controls.Add(BlockLabel("周榜 → 资料 → 证据 → 五格讲稿 → Kokoro → 字幕 → CanvasWorld → 质检 → 导出", Ink, 52), 0, 0);
        page.Controls.Add(BlockLabel("每个 ProjectRun 独立推进；失败项目进入 quarantine，不阻塞其他项目。", Muted, 44), 0, 1);
        AttachPage(page);
    }

    private void ShowContent()
    {
        pageTitle.Text = "内容"; ResetPage();
        var page = PageTable(2);
        page.Controls.Add(BlockLabel("五格故事板：开场 | 原理 | 案例 | 应用 | 结论（hook 只在结论最后一个 beat）", Ink, 54), 0, 0);
        page.Controls.Add(BlockLabel("EvidencePack、讲稿、发音文本、字幕和 visualActions 在 runs/{projectId}/ 中持久化。", Muted, 48), 0, 1);
        AttachPage(page);
    }

    private void ShowVoices()
    {
        pageTitle.Text = "音色与音乐"; ResetPage();
        var page = PageTable(3);
        page.Controls.Add(BlockLabel("所有显式音色在配音前预缓存；试听仅读取本地 previewAudioPath。", Muted, 50), 0, 0);
        var grid = new DataGridView { Dock = DockStyle.Fill, Height = 180, ReadOnly = true, AllowUserToAddRows = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, RowHeadersVisible = false, BackgroundColor = Color.White, DataSource = new[] { new { VoiceId = "zf_001", DisplayName = "中文女声 · ZF 001", Status = "由 VoiceCatalogPreloader 检查" } } };
        page.RowStyles[1] = new RowStyle(SizeType.Absolute, 180); page.Controls.Add(grid, 0, 1);
        page.Controls.Add(BlockLabel("BGM 缺失时自动无 BGM 导出，并在 quality-report.json 写入 warning。", Muted, 44), 0, 2);
        AttachPage(page);
    }

    private void ShowPreview()
    {
        pageTitle.Text = "预览与质检"; ResetPage();
        var page = PageTable(1);
        var preview = new TableLayoutPanel { Dock = DockStyle.Fill, Height = 500, ColumnCount = 2, RowCount = 1, Margin = new Padding(0) };
        preview.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 282)); preview.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var canvas = new Panel { Width = 270, Height = 480, BackColor = ColorTranslator.FromHtml("#050816"), BorderStyle = BorderStyle.FixedSingle, Margin = new Padding(0, 0, 12, 0) };
        canvas.Paint += (_, e) => { using var pen = new Pen(ColorTranslator.FromHtml("#4CC9F0"), 1); var insetX = canvas.Width / 14; var insetY = canvas.Height / 12; e.Graphics.DrawRectangle(pen, insetX, insetY, canvas.Width - insetX * 2, canvas.Height - insetY * 2); e.Graphics.DrawString("CanvasWorld\n1080×1920", new Font("Segoe UI", 12), Brushes.White, 80, 225); };
        preview.Controls.Add(canvas, 0, 0);
        preview.Controls.Add(BlockLabel("安全区：x=72..1008，顶部刘海避让。质量报告检查尺寸、帧率、字幕、证据、发音和音频峰值。", Muted, 120), 1, 0);
        page.Controls.Add(preview, 0, 0); AttachPage(page);
    }

    private void ShowSettings()
    {
        pageTitle.Text = "设置"; ResetPage();
        var page = PageTable(3);
        page.Controls.Add(BlockLabel("运行环境与发布", Ink, 42), 0, 0);
        page.Controls.Add(BlockLabel("Node.js / Python / Kokoro / Remotion / FFmpeg 使用新项目独立配置；缺失项由环境诊断报告，不从旧项目复制。", Muted, 64), 0, 1);
        page.Controls.Add(BlockLabel(Path.Combine(FindWorkspaceRoot(), "artifacts", "MotionVideoPipeline.exe"), Ink, 44), 0, 2);
        AttachPage(page);
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (runningTask is null) return;
        var choice = MessageBox.Show(this, "当前有批量任务正在运行。是：取消并等待 Worker 退出；否：后台运行；取消：返回。", "任务运行中", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
        if (choice == DialogResult.Cancel) { e.Cancel = true; return; }
        if (choice == DialogResult.Yes) { runCancellation?.Cancel(); try { runningTask.GetAwaiter().GetResult(); } catch { } }
        e.Cancel = false;
    }
}
