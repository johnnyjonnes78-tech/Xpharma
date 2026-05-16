# OrdiveX Manual: MD -> HTML converter with proper accent restoration
$mdPath = Join-Path $PSScriptRoot "ORDIVEX_MANUEL_INTERNE.md"
$htmlPath = Join-Path $PSScriptRoot "ORDIVEX_MANUEL_INTERNE.html"

# Read raw bytes
$bytes = [System.IO.File]::ReadAllBytes($mdPath)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)
$content = $content.TrimStart([char]0xFEFF)

# --- RESTORE ACCENTED CHARACTERS FROM MOJIBAKE ---
# The file is double-encoded UTF-8. Fix by mapping mojibake -> correct char.
# Pattern: C3 xx in UTF-8 decoded as Latin-1 then re-encoded gives "Ã" + Latin-1 char

# Build replacement map using char codes (avoids source encoding issues)
$mojibakeMap = @{}
# a-grave: U+00E0 = C3 A0 -> mojibake = \u00C3\u00A0
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00A0)] = [string]([char]0x00E0)  # a
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00A2)] = [string]([char]0x00E2)  # a circ
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00A9)] = [string]([char]0x00E9)  # e acute
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00A8)] = [string]([char]0x00E8)  # e grave
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00AA)] = [string]([char]0x00EA)  # e circ
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00AB)] = [string]([char]0x00EB)  # e dier
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00AE)] = [string]([char]0x00EE)  # i circ
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00AF)] = [string]([char]0x00EF)  # i dier
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00B4)] = [string]([char]0x00F4)  # o circ
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00B9)] = [string]([char]0x00F9)  # u grave
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00BB)] = [string]([char]0x00FB)  # u circ
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00BC)] = [string]([char]0x00FC)  # u dier
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x00A7)] = [string]([char]0x00E7)  # c cedilla
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x0089)] = [string]([char]0x00C9)  # E acute (cap)
$mojibakeMap[[string]([char]0x00C3) + [string]([char]0x0097)] = [string]([char]0x00D7)  # multiplication sign

# Also fix E2 80 xx sequences (em-dash, smart quotes, etc)
# These appear as 3 mojibake chars: \u00E2\u0080\u0093 = em-dash, etc.
$mojibakeMap[[string]([char]0x00E2) + [string]([char]0x0080) + [string]([char]0x0093)] = [string]([char]0x2013) # en-dash
$mojibakeMap[[string]([char]0x00E2) + [string]([char]0x0080) + [string]([char]0x0094)] = [string]([char]0x2014) # em-dash
$mojibakeMap[[string]([char]0x00E2) + [string]([char]0x0080) + [string]([char]0x0098)] = "'"  # left single quote
$mojibakeMap[[string]([char]0x00E2) + [string]([char]0x0080) + [string]([char]0x0099)] = "'"  # right single quote
$mojibakeMap[[string]([char]0x00E2) + [string]([char]0x0080) + [string]([char]0x009C)] = '"'  # left double quote
$mojibakeMap[[string]([char]0x00E2) + [string]([char]0x0080) + [string]([char]0x009D)] = '"'  # right double quote

# Apply mojibake fixes (longest patterns first)
foreach ($key in ($mojibakeMap.Keys | Sort-Object { $_.Length } -Descending)) {
    $content = $content.Replace($key, $mojibakeMap[$key])
}

# Fix remaining known sequences using regex with Unicode escapes
# Box drawing chars for tree view
$content = $content -replace '\u2502\s*\u2514\u2500\u2500', '|--'
$content = $content -replace '\u251C\u2500\u2500', '|--'
$content = $content -replace '\u2514\u2500\u2500', '|--'
$content = $content -replace '\u2502', '|'

# Arrows
$content = $content -replace '\u2192', '->'
$content = $content -replace '\u2190', '<-'
$content = $content -replace '\u2191', '^'
$content = $content -replace '\u2193', 'v'
$content = $content -replace '\u2194', '<->'
$content = $content -replace '\u2013', '--'
$content = $content -replace '\u2014', '--'
$content = $content -replace '\u21D3', 'v'

# Symbols
$content = $content -replace '\u2295', '+'
$content = $content -replace '\u2261', '='
$content = $content -replace '\u00D7', 'x'
$content = $content -replace '\u2264', '<='
$content = $content -replace '\u00B1', '+/-'
$content = $content -replace '\u03A3', 'Somme'

# Check marks, crosses
$content = $content -replace '\u2705', 'Oui'
$content = $content -replace '\u274C', 'Non'

# Emojis to text
$content = $content -replace '\uD83D\uDD34', '[Rouge]'
$content = $content -replace '\uD83D\uDFE1', '[Orange]'
$content = $content -replace '\uD83D\uDFE2', '[Vert]'
$content = $content -replace '\uD83D\uDE28', '[ALERTE]'
$content = $content -replace '\uD83D\uDD04', '[Retour]'
$content = $content -replace '\u23F3', '[Attente]'
$content = $content -replace '\u26A0\uFE0F', '[ATTENTION]'
$content = $content -replace '\u26A0', '[ATTENTION]'
$content = $content -replace '\u2139\uFE0F', '[Info]'
$content = $content -replace '\u2139', '[Info]'

# HTML entities
$content = $content -replace '&amp;', '&'
$content = $content -replace '&#39;', "'"

# Remove anchor tags like `<a id="..."></a>`
$content = $content -replace '`<a id="[^"]*"></a>`', ''

# --- HELPER: Generate consistent slug from text ---
function Make-Slug($text) {
    $s = $text.ToLower().Trim()
    # Normalize accented chars for slug
    $s = $s -replace '[àâä]', 'a'
    $s = $s -replace '[éèêë]', 'e'
    $s = $s -replace '[îï]', 'i'
    $s = $s -replace '[ôö]', 'o'
    $s = $s -replace '[ùûü]', 'u'
    $s = $s -replace '[ç]', 'c'
    $s = $s -replace '[^a-z0-9\s-]', ''
    $s = $s -replace '\s+', '-'
    $s = $s -replace '-+', '-'
    $s = $s.Trim('-')
    return $s
}

# --- MARKDOWN TO HTML CONVERSION ---
$lines = $content -split "`r?`n"
$html = [System.Collections.ArrayList]::new()
$inCode = $false
$inTable = $false
$inList = $false

foreach ($line in $lines) {
    # Code blocks
    if ($line -match '^```') {
        if ($inCode) { [void]$html.Add('</code></pre>'); $inCode = $false }
        else {
            $lang = ($line -replace '^```','').Trim()
            if (-not $lang) { $lang = 'text' }
            [void]$html.Add("<pre><code class=""language-$lang"">")
            $inCode = $true
        }
        continue
    }
    if ($inCode) {
        [void]$html.Add($line.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;'))
        continue
    }

    $t = $line.Trim()
    if ($t -eq '') {
        if ($inTable) { [void]$html.Add('</tbody></table></div>'); $inTable = $false }
        if ($inList) { [void]$html.Add('</ul>'); $inList = $false }
        continue
    }

    # Tables
    if ($t -match '^\|.*\|$') {
        if ($t -match '^\|[\s\-:|]+\|$') { continue }
        $cells = ($t.Trim('|') -split '\|') | ForEach-Object { $_.Trim() }
        if (-not $inTable) {
            $inTable = $true
            [void]$html.Add('<div class="table-wrap"><table><thead><tr>')
            foreach ($c in $cells) {
                $c = $c -replace '\*\*([^*]+)\*\*', '<strong>$1</strong>'
                $c = $c -replace '`([^`]+)`', '<code>$1</code>'
                [void]$html.Add("<th>$c</th>")
            }
            [void]$html.Add('</tr></thead><tbody>')
        } else {
            [void]$html.Add('<tr>')
            foreach ($c in $cells) {
                $c = $c -replace '\*\*([^*]+)\*\*', '<strong>$1</strong>'
                $c = $c -replace '`([^`]+)`', '<code>$1</code>'
                [void]$html.Add("<td>$c</td>")
            }
            [void]$html.Add('</tr>')
        }
        continue
    } elseif ($inTable) {
        [void]$html.Add('</tbody></table></div>'); $inTable = $false
    }

    # Headers
    if ($t -match '^(#{1,6})\s+(.*)') {
        if ($inList) { [void]$html.Add('</ul>'); $inList = $false }
        $level = $Matches[1].Length
        $text = $Matches[2].Trim()
        $slug = Make-Slug $text
        [void]$html.Add("<h$level id=""$slug"">$text</h$level>")
        continue
    }

    # HR
    if ($t -match '^-{3,}$') { [void]$html.Add('<hr>'); continue }

    # List items
    if ($t -match '^-\s+(.*)') {
        if (-not $inList) { [void]$html.Add('<ul>'); $inList = $true }
        $text = $Matches[1]
        $text = $text -replace '\*\*([^*]+)\*\*', '<strong>$1</strong>'
        $text = $text -replace '`([^`]+)`', '<code>$1</code>'
        $text = $text -replace '\[([^\]]+)\]\(([^)]+)\)', '<a href="$2">$1</a>'
        [void]$html.Add("<li>$text</li>")
        continue
    }
    # Sub-list
    if ($line -match '^\s{2,}-\s+(.*)') {
        $text = $Matches[1]
        $text = $text -replace '\*\*([^*]+)\*\*', '<strong>$1</strong>'
        $text = $text -replace '`([^`]+)`', '<code>$1</code>'
        [void]$html.Add("<li style=""margin-left:20px"">$text</li>")
        continue
    }

    if ($inList -and $t -notmatch '^-\s' -and $line -notmatch '^\s') {
        [void]$html.Add('</ul>'); $inList = $false
    }

    # Blockquote
    if ($t -match '^>\s*(.*)') {
        $text = $Matches[1]
        $text = $text -replace '\*\*([^*]+)\*\*', '<strong>$1</strong>'
        [void]$html.Add("<blockquote>$text</blockquote>")
        continue
    }

    # Numbered list
    if ($t -match '^\d+\.\s+(.*)') {
        $text = $Matches[1]
        $text = $text -replace '\*\*([^*]+)\*\*', '<strong>$1</strong>'
        $text = $text -replace '`([^`]+)`', '<code>$1</code>'
        [void]$html.Add("<p class=""step"">$text</p>")
        continue
    }

    # Skip suite lines
    if ($t -match '^\*?Suite') { continue }

    # Paragraph
    $text = $t
    $text = $text -replace '\*\*([^*]+)\*\*', '<strong>$1</strong>'
    $text = $text -replace '`([^`]+)`', '<code>$1</code>'
    $text = $text -replace '\[([^\]]+)\]\(([^)]+)\)', '<a href="$2">$1</a>'
    # Escape script tags in content
    $text = $text -replace '<script>', '&lt;script&gt;'
    $text = $text -replace '</script>', '&lt;/script&gt;'
    [void]$html.Add("<p>$text</p>")
}

if ($inCode) { [void]$html.Add('</code></pre>') }
if ($inTable) { [void]$html.Add('</tbody></table></div>') }
if ($inList) { [void]$html.Add('</ul>') }

$body = $html -join "`n"

# Now fix TOC links: find all href="#xxx" in <a> tags within <li> and match them to heading IDs
# The TOC was generated from the original markdown anchors which have different format
# We need to make TOC links use the same slug function
# Actually, since both TOC and headings now use Make-Slug, they should match

$fullHtml = @"
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OrdiveX - Manuel Interne v9.4.2</title>
<style>
:root{--bg:#0f1117;--surface:#1a1d27;--surface2:#242837;--border:#2e3348;--text:#e4e6f0;--muted:#8b8fa8;--accent:#4f8cff;--accent2:#6c5ce7;--success:#00b894;--warn:#fdcb6e;--danger:#e17055;--code-bg:#1e2235;--font:'Segoe UI',system-ui,-apple-system,sans-serif;--mono:'Cascadia Code','Fira Code','JetBrains Mono',monospace}
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.7;font-size:15px}
.container{max-width:960px;margin:0 auto;padding:40px 32px 80px}
h1{font-size:2.2em;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:48px 0 16px;padding-bottom:12px;border-bottom:2px solid var(--border)}
h2{font-size:1.5em;font-weight:700;color:var(--accent);margin:40px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border)}
h3{font-size:1.15em;font-weight:600;color:var(--text);margin:28px 0 8px}
p{margin:8px 0}p.step{padding-left:20px;border-left:3px solid var(--accent);margin:6px 0}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
strong{color:#fff;font-weight:600}hr{border:none;border-top:1px solid var(--border);margin:32px 0}
code{font-family:var(--mono);background:var(--code-bg);color:var(--warn);padding:2px 6px;border-radius:4px;font-size:.88em}
pre{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:16px 20px;overflow-x:auto;margin:12px 0;font-size:.88em;line-height:1.6}
pre code{background:none;padding:0;color:var(--text)}
ul,ol{padding-left:24px;margin:8px 0}li{margin:4px 0}li::marker{color:var(--accent)}
blockquote{border-left:4px solid var(--warn);background:rgba(253,203,110,.06);padding:12px 16px;margin:12px 0;border-radius:0 6px 6px 0;color:var(--warn);font-weight:500}
.table-wrap{overflow-x:auto;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:.92em}
th{background:var(--surface2);color:var(--accent);font-weight:600;text-align:left;padding:10px 14px;border-bottom:2px solid var(--border);white-space:nowrap}
td{padding:8px 14px;border-bottom:1px solid var(--border)}
tr:nth-child(even) td{background:rgba(255,255,255,.02)}
@media print{body{background:#fff;color:#222}.container{max-width:100%;padding:20px}h1,h2,h3{color:#1a1a2e;-webkit-text-fill-color:#1a1a2e}pre,code{background:#f5f5f5;color:#333;border-color:#ddd}table th{background:#eee;color:#333}table td{color:#333;border-color:#ddd}}
</style>
</head>
<body>
<div class="container">
$body
</div>
</body>
</html>
"@

[System.IO.File]::WriteAllText($htmlPath, $fullHtml, (New-Object System.Text.UTF8Encoding $false))
Write-Host "OK - $htmlPath"
Write-Host "Taille: $([math]::Round((Get-Item $htmlPath).Length/1024,1)) Ko"
