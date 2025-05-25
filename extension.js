const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('indent2tree extension is now active!');

    // インデント → ツリー変換コマンド
    let convertCommand = vscode.commands.registerCommand('indent2tree.convert', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('エディタが開かれていません');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showErrorMessage('テキストが選択されていません');
            return;
        }

        const text = editor.document.getText(selection);
        const convertedText = convertIndentToTree(text);

        editor.edit(editBuilder => {
            editBuilder.replace(selection, convertedText);
        });
    });

    // ツリー → インデント変換コマンド
    let convertBackCommand = vscode.commands.registerCommand('indent2tree.convertBack', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('エディタが開かれていません');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showErrorMessage('テキストが選択されていません');
            return;
        }

        const text = editor.document.getText(selection);
        const convertedText = convertTreeToIndent(text);

        editor.edit(editBuilder => {
            editBuilder.replace(selection, convertedText);
        });
    });

    context.subscriptions.push(convertCommand, convertBackCommand);
}

/**
 * インデントされたテキストをツリー構造に変換する
 * @param {string} text 変換するテキスト
 * @returns {string} 変換後のテキスト
 */
function convertIndentToTree(text) {
    const lines = text.split('\n');
    if (lines.length === 0) {
        return '';
    }

    // インデントの種類を検出（タブまたはスペース）
    let usesTab = false;
    let spaceCount = 2; // デフォルトのスペース数

    for (const line of lines) {
        if (line.startsWith('\t')) {
            usesTab = true;
            break;
        } else if (line.startsWith('  ')) {
            // スペースを使用している場合は既にデフォルト値を設定済み
            break;
        }
    }

    // インデントレベルを計算
    const nodes = [];

    // 各行のインデントレベルを計算
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
            nodes.push({
                level: -1,
                text: '',
                index: i
            });
            continue;
        }

        let level = 0;
        if (usesTab) {
            // タブの場合は単純にタブの数をカウント
            for (let j = 0; j < line.length; j++) {
                if (line[j] === '\t') {
                    level++;
                } else {
                    break;
                }
            }
        } else {
            // スペースの場合は2スペースごとに1レベル
            let spaceCount = 0;
            for (let j = 0; j < line.length; j++) {
                if (line[j] === ' ') {
                    spaceCount++;
                } else {
                    break;
                }
            }
            level = Math.floor(spaceCount / 2);
        }

        nodes.push({
            level,
            text: line.trim(),
            index: i
        });
    }

    // 親子関係を構築
    const rootNodes = [];
    const stack = [];

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.level < 0) continue; // 空行はスキップ

        // スタックから現在のノードより高いレベルのノードをポップ
        while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
            stack.pop();
        }

        if (stack.length === 0) {
            // ルートノード
            rootNodes.push(node);
        } else {
            // 親ノードの子として追加
            const parent = stack[stack.length - 1];
            if (!parent.children) parent.children = [];
            parent.children.push(node);
        }

        stack.push(node);
    }

    // ツリー構造を文字列に変換
    const result = [];

    function renderTree(node, prefix = '', isLast = false, isRoot = false) {
        if (node.level < 0) {
            result.push(''); // 空行
            return;
        }

        if (isRoot) {
            // ルートノードはそのまま表示
            result.push(node.text);
        } else {
            // 子ノードはツリー記号を付けて表示
            const symbol = isLast ? '└── ' : '├── ';
            result.push(prefix + symbol + node.text);
        }

        if (node.children && node.children.length > 0) {
            const newPrefix = isRoot ? prefix : prefix + (isLast ? '    ' : '│   ');
            for (let i = 0; i < node.children.length; i++) {
                const isLastChild = i === node.children.length - 1;
                renderTree(node.children[i], newPrefix, isLastChild);
            }
        }
    }

    // 空行を処理
    let lastIndex = -1;
    for (let node of rootNodes) {
        // 前の行との間に空行があれば追加
        for (let i = lastIndex + 1; i < node.index; i++) {
            result.push('');
        }

        renderTree(node, '', true, true);
        lastIndex = node.index;

        // 子ノードの最後のインデックスを更新
        function updateLastIndex(node) {
            if (node.index > lastIndex) lastIndex = node.index;
            if (node.children) {
                for (let child of node.children) {
                    updateLastIndex(child);
                }
            }
        }
        updateLastIndex(node);
    }

    return result.join('\n');
}

/**
 * ツリー構造をインデントに変換する
 * @param {string} text 変換するテキスト
 * @returns {string} 変換後のテキスト
 */
function convertTreeToIndent(text) {
    const lines = text.split('\n');
    const result = [];

    // インデントに使用する文字（スペース2つを使用）
    const indentChar = '  ';

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 空行はそのまま追加
        if (line.trim() === '') {
            result.push('');
            continue;
        }

        // ルートノード（ツリー記号がない行）の場合
        if (!line.includes('├── ') && !line.includes('└── ')) {
            result.push(line);
            continue;
        }

        // 行の先頭からツリー記号までの部分を解析して深さを計算
        let depth = 0;
        let content = '';

        // ツリー記号のパターンを検出
        const branchMatch = line.match(/((?:│   |    )*)(?:├── |└── )(.*)/);

        if (branchMatch) {
            const prefix = branchMatch[1]; // 「│   」と「    」の部分
            content = branchMatch[2]; // 内容部分

            // 深さを計算（プレフィックスの長さ / 4 + 1）
            depth = prefix.length / 4 + 1;
        } else {
            // パターンに一致しない場合は元の行をそのまま使用
            content = line;
        }

        // インデントを適用して結果に追加
        result.push(indentChar.repeat(depth) + content);
    }

    return result.join('\n');
}


function deactivate() {}

module.exports = {
    activate,
    deactivate
}