using GitHubTrendingVideo.Models;

namespace GitHubTrendingVideo;

public sealed class ProviderEditorForm : Form
{
    private readonly ModelProvider _provider;
    private readonly TextBox _nameBox = new() { Width = 400 };
    private readonly TextBox _baseUrlBox = new() { Width = 400 };
    private readonly TextBox _modelBox = new() { Width = 400 };
    private readonly TextBox _apiKeyBox = new() { Width = 400, UseSystemPasswordChar = true };
    private readonly ComboBox _protocolBox = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 400 };
    private readonly CheckBox _completeUrlBox = new() { AutoSize = true };
    private readonly ComboBox _reasoningParamBox = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 400 };
    private readonly TextBox _customParamBox = new() { Width = 400, Enabled = false };
    private readonly Panel _advancedPanel = new() { Dock = DockStyle.Top, AutoSize = true, Visible = false };
    private readonly Button _advancedToggle;

    public ProviderEditorForm(ModelProvider? provider = null)
    {
        _provider = provider ?? new ModelProvider();
        Text = provider == null ? "新增供应商" : "编辑供应商";
        Size = new Size(540, 520);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Microsoft YaHei UI", 9.5f);
        BackColor = Color.FromArgb(245, 247, 250);

        _protocolBox.Items.AddRange(new[] { "自动", "Responses API", "Chat Completions" });
        _reasoningParamBox.Items.AddRange(new[] { "自动", "reasoning.effort", "reasoning_effort", "不发送", "自定义" });

        _nameBox.Text = _provider.Name;
        _baseUrlBox.Text = _provider.BaseUrl;
        _modelBox.Text = _provider.DefaultModel;
        _apiKeyBox.Text = _provider.ApiKey;
        _protocolBox.SelectedIndex = _provider.Protocol switch { "responses" => 1, "chat" => 2, _ => 0 };
        _completeUrlBox.Checked = _provider.CompleteUrl;
        _reasoningParamBox.SelectedIndex = _provider.ReasoningParamType switch { "reasoning.effort" => 1, "reasoning_effort" => 2, "none" => 3, "custom" => 4, _ => 0 };
        _customParamBox.Text = _provider.CustomReasoningParam;
        _customParamBox.Enabled = _reasoningParamBox.SelectedIndex == 4;

        _reasoningParamBox.SelectedIndexChanged += (_, _) => _customParamBox.Enabled = _reasoningParamBox.SelectedIndex == 4;

        _advancedToggle = new Button
        {
            Text = "▼ 高级选项",
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(71, 85, 105),
            ForeColor = Color.White,
            Width = 460,
            Height = 36,
            Dock = DockStyle.Top,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(8, 0, 0, 0)
        };
        _advancedToggle.Click += (_, _) => ToggleAdvancedPanel();

        BuildUI();
    }

    private void BuildUI()
    {
        var container = new Panel { Dock = DockStyle.Fill, Padding = new Padding(20), AutoScroll = true };
        var layout = new TableLayoutPanel { ColumnCount = 1, RowCount = 1, Dock = DockStyle.Top, AutoSize = true };

        AddField(layout, "供应商名称 *", _nameBox);
        AddField(layout, "Base URL *", _baseUrlBox);
        AddField(layout, "默认模型 *", _modelBox);
        AddField(layout, "API Key *", _apiKeyBox);

        layout.Controls.Add(_advancedToggle);
        layout.RowCount++;

        BuildAdvancedPanel();
        layout.Controls.Add(_advancedPanel);
        layout.RowCount++;

        var buttonPanel = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 50, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 10, 0, 0) };
        var saveButton = new Button { Text = "保存", Width = 90, Height = 34, BackColor = Color.FromArgb(37, 99, 235), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
        var cancelButton = new Button { Text = "取消", Width = 90, Height = 34, BackColor = Color.FromArgb(71, 85, 105), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Margin = new Padding(8, 0, 0, 0) };

        saveButton.Click += (_, _) => SaveAndClose();
        cancelButton.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

        buttonPanel.Controls.AddRange(new Control[] { saveButton, cancelButton });
        layout.Controls.Add(buttonPanel);
        layout.RowCount++;

        container.Controls.Add(layout);
        Controls.Add(container);
    }

    private void BuildAdvancedPanel()
    {
        var table = new TableLayoutPanel { ColumnCount = 1, RowCount = 1, Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(10), BackColor = Color.FromArgb(229, 231, 235) };
        AddField(table, "上游格式", _protocolBox);
        AddField(table, "完整 URL", _completeUrlBox);
        AddField(table, "认证字段", _reasoningParamBox);
        AddField(table, "自定义参数", _customParamBox);
        _advancedPanel.Controls.Add(table);
    }

    private void AddField(TableLayoutPanel table, string label, Control control)
    {
        var labelControl = new Label { Text = label, AutoSize = true, Margin = new Padding(0, 8, 0, 4), ForeColor = Color.FromArgb(51, 65, 85) };
        control.Margin = new Padding(0, 0, 0, 12);
        table.Controls.Add(labelControl);
        table.RowCount++;
        table.Controls.Add(control);
        table.RowCount++;
    }

    private void ToggleAdvancedPanel()
    {
        _advancedPanel.Visible = !_advancedPanel.Visible;
        _advancedToggle.Text = _advancedPanel.Visible ? "▲ 高级选项" : "▼ 高级选项";
        Height = _advancedPanel.Visible ? 720 : 520;
    }

    private void SaveAndClose()
    {
        if (string.IsNullOrWhiteSpace(_nameBox.Text) || string.IsNullOrWhiteSpace(_baseUrlBox.Text) ||
            string.IsNullOrWhiteSpace(_modelBox.Text) || string.IsNullOrWhiteSpace(_apiKeyBox.Text))
        {
            MessageBox.Show("请填写所有必填字段（标记 * 的字段）", "验证失败", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _provider.Name = _nameBox.Text.Trim();
        _provider.BaseUrl = _baseUrlBox.Text.Trim();
        _provider.DefaultModel = _modelBox.Text.Trim();
        _provider.ApiKey = _apiKeyBox.Text.Trim();
        _provider.Protocol = _protocolBox.SelectedIndex switch { 1 => "responses", 2 => "chat", _ => "auto" };
        _provider.CompleteUrl = _completeUrlBox.Checked;
        _provider.ReasoningParamType = _reasoningParamBox.SelectedIndex switch { 1 => "reasoning.effort", 2 => "reasoning_effort", 3 => "none", 4 => "custom", _ => "auto" };
        _provider.CustomReasoningParam = _customParamBox.Text.Trim();

        DialogResult = DialogResult.OK;
        Close();
    }

    public ModelProvider GetProvider() => _provider;
}
