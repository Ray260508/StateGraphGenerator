document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 初始化與 DOM 綁定 ---
    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('canvasContainer');
    const contextMenu = document.getElementById('contextMenu');
    const renameInput = document.getElementById('renameInput');
    const projectTitle = document.getElementById('projectTitle');

    // 按鈕監聽
    document.getElementById('btnPreview').onclick = generateJSON;
    document.getElementById('btnDownload').onclick = downloadJSON;
    document.getElementById('btnModalDownload').onclick = downloadJSONFromModal;
    document.getElementById('fileInput').onchange = (e) => importJSON(e.target);
    document.getElementById('btnClear').onclick = openConfirmModal;
    
    // 視窗關閉按鈕
    document.getElementById('btnCloseCodeModal').onclick = () => closeModal('codeModal');
    document.getElementById('btnCancelClear').onclick = () => closeModal('confirmModal');
    document.getElementById('btnConfirmClear').onclick = confirmClearCanvas;

    // 標題樣式邏輯
    function updateTitleStyle() {
        if (projectTitle.value.trim() === 'Untitled' || projectTitle.value.trim() === '') {
            projectTitle.classList.add('is-default');
        } else {
            projectTitle.classList.remove('is-default');
        }
    }
    updateTitleStyle();
    projectTitle.addEventListener('input', updateTitleStyle);
    projectTitle.addEventListener('focus', () => { if (projectTitle.value === 'Untitled') projectTitle.select(); });
    projectTitle.addEventListener('blur', () => { if (projectTitle.value.trim() === '') { projectTitle.value = 'Untitled'; updateTitleStyle(); } });
    projectTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') projectTitle.blur(); });

    // --- 2. 核心資料結構 ---
    let nodes = []; 
    let edges = []; 
    
    // 相機 (視角)
    let camera = { x: 0, y: 0, zoom: 1 };
    
    // 互動狀態
    let selectedNode = null;
    let selectedEdge = null;
    let draggingNode = null;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    
    let isCreatingEdge = false;
    let dragStartNode = null;
    
    let mouseX = 0; 
    let mouseY = 0; 

    let contextMenuPos = { x: 0, y: 0 }; 
    let isRenaming = false;
    let renamingNode = null;

    // 常數
    const BASE_RADIUS = 25; 
    const PADDING_RADIUS = 15; 
    const THEME = {
        nodeFill: '#1e1e1e',
        nodeBorder: '#00e5ff',
        nodeText: '#ffffff',
        nodeSelected: '#ff0055',
        edge: '#666666',
        edgeSelected: '#ff0055',
        edgeArrow: '#00e5ff',
        grid: 'rgba(0, 229, 255, 0.1)'
    };

    // --- 3. 渲染循環 (Render Loop) ---
    // 即使沒有物理，為了拖曳的順暢感，我們還是使用動畫循環來重繪
    function animate() {
        draw();          
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate); // 啟動循環

    // 視窗大小調整
    function resize() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (nodes.length === 0) {
            camera.x = canvas.width / 2;
            camera.y = canvas.height / 2;
        }
    }
    window.addEventListener('resize', resize);
    setTimeout(resize, 100);

    // --- 4. 座標系統 ---
    function screenToWorld(sx, sy) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (sx - rect.left - camera.x) / camera.zoom,
            y: (sy - rect.top - camera.y) / camera.zoom
        };
    }

    function worldToScreen(wx, wy) {
        return {
            x: (wx * camera.zoom) + camera.x,
            y: (wy * camera.zoom) + camera.y
        };
    }

    function calculateNodeRadius(name) {
        ctx.font = 'bold 14px Arial';
        const metrics = ctx.measureText(name);
        return Math.max(BASE_RADIUS, (metrics.width / 2) + PADDING_RADIUS);
    }

    // --- 5. 互動事件監聽 (滑鼠/鍵盤) ---

    canvas.addEventListener('mousedown', e => {
        if(isRenaming) finishRenaming();
        hideContextMenu();
        
        const pos = screenToWorld(e.clientX, e.clientY);
        mouseX = pos.x; mouseY = pos.y;

        const node = getNodeAt(pos.x, pos.y);
        const edge = getEdgeAt(pos.x, pos.y);

        // 中鍵 或 空白處+左鍵 = 平移
        if (e.button === 1 || (e.button === 0 && !node && !edge && !e.shiftKey)) {
            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            return;
        }

        // 左鍵操作
        if (e.button === 0) { 
            // 如果在連線模式下點擊空白處，取消連線
            if (isCreatingEdge && !node) {
                 cancelEdgeCreation();
                 return;
            }

            if (e.shiftKey && node) {
                // Shift+拖曳 = 建立連線
                isCreatingEdge = true;
                dragStartNode = node;
                selectedNode = null;
                selectedEdge = null;
            } else if (node) {
                if (isCreatingEdge && dragStartNode && node !== dragStartNode) {
                    // 完成連線
                    createEdge(dragStartNode, node);
                    isCreatingEdge = false;
                    dragStartNode = null;
                } else {
                    // 開始拖曳節點
                    draggingNode = node;
                    selectedNode = node;
                    selectedEdge = null;
                }
            } else if (edge) {
                // 選取連線
                selectedEdge = edge;
                selectedNode = null;
            } else {
                // 取消選取
                selectedNode = null;
                selectedEdge = null;
            }
        }
    });

    canvas.addEventListener('mousemove', e => {
        const pos = screenToWorld(e.clientX, e.clientY);
        mouseX = pos.x; 
        mouseY = pos.y;

        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            camera.x += dx;
            camera.y += dy;
            panStart = { x: e.clientX, y: e.clientY };
            if(isRenaming) updateRenameInputPosition(); 
            return;
        }

        if (draggingNode) {
            // 手動拖曳更新位置
            draggingNode.x = pos.x;
            draggingNode.y = pos.y;
            if(isRenaming && renamingNode === draggingNode) updateRenameInputPosition();
        }
    });

    canvas.addEventListener('mouseup', e => {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
            return;
        }

        const pos = screenToWorld(e.clientX, e.clientY);
        
        // 處理連線建立
        if (isCreatingEdge && dragStartNode) {
            const targetNode = getNodeAt(pos.x, pos.y);
            if (targetNode && targetNode !== dragStartNode) {
                createEdge(dragStartNode, targetNode);
                if (e.shiftKey) { isCreatingEdge = false; dragStartNode = null; }
            } else if (e.shiftKey) {
                // Shift 放開如果沒選到東西，取消
                isCreatingEdge = false;
                dragStartNode = null;
            }
        } 
        
        // 點擊連線切換方向
        if (selectedEdge && !draggingNode && !isCreatingEdge) {
             const edgeCheck = getEdgeAt(pos.x, pos.y);
             if (edgeCheck === selectedEdge) {
                 selectedEdge.type = selectedEdge.type === 'directed' ? 'bidirectional' : 'directed';
             }
        }
        draggingNode = null;
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const delta = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(delta * zoomIntensity); 
        const newZoom = camera.zoom * zoomFactor;

        if (newZoom > 0.05 && newZoom < 10) {
            const rect = canvas.getBoundingClientRect();
            const mouseScreenX = e.clientX - rect.left;
            const mouseScreenY = e.clientY - rect.top;
            const mouseWorldX = (mouseScreenX - camera.x) / camera.zoom;
            const mouseWorldY = (mouseScreenY - camera.y) / camera.zoom;

            camera.zoom = newZoom;
            camera.x = mouseScreenX - mouseWorldX * camera.zoom;
            camera.y = mouseScreenY - mouseWorldY * camera.zoom;

            if(isRenaming) updateRenameInputPosition();
        }
    }, { passive: false });

    canvas.addEventListener('dblclick', e => {
        const pos = screenToWorld(e.clientX, e.clientY);
        const node = getNodeAt(pos.x, pos.y);
        if (node) startRenaming(node);
    });

    window.addEventListener('keydown', e => {
        if (isRenaming) {
            if (e.key === 'Enter') finishRenaming();
            if (e.key === 'Escape') cancelRenaming();
            return;
        }
        if (e.key === 'Escape') {
            if (isCreatingEdge) { cancelEdgeCreation(); return; }
            if (selectedNode || selectedEdge) { selectedNode = null; selectedEdge = null; return; }
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedNode) deleteNode(selectedNode);
            else if (selectedEdge) { edges = edges.filter(e => e !== selectedEdge); selectedEdge = null; }
        }
    });

    // --- 6. 右鍵選單 ---
    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        const pos = screenToWorld(e.clientX, e.clientY);
        const node = getNodeAt(pos.x, pos.y);
        contextMenuPos = pos; 
        buildContextMenu(node);
        contextMenu.style.display = 'block';
        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';
    });
    window.addEventListener('click', (e) => { if(e.target !== renameInput) hideContextMenu(); });

    function buildContextMenu(targetNode) {
        contextMenu.innerHTML = '';
        if (targetNode) {
            addMenuItem("🔗 新增連線", () => startEdgeCreation(targetNode));
            addMenuSeparator();
            addMenuItem("✏️ 重新命名", () => startRenaming(targetNode));
            addMenuItem("🗑️ 刪除", () => deleteNode(targetNode));
        } else {
            addMenuItem("🔵 新增節點", () => spawnNode());
        }
    }
    function addMenuItem(text, onClick) {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.textContent = text;
        div.onclick = () => { onClick(); hideContextMenu(); };
        contextMenu.appendChild(div);
    }
    function addMenuSeparator() {
        const div = document.createElement('div');
        div.className = 'menu-separator';
        contextMenu.appendChild(div);
    }
    function hideContextMenu() { contextMenu.style.display = 'none'; }

    // --- 7. 節點操作 ---
    function startRenaming(node) {
        if (!node) return;
        isRenaming = true;
        renamingNode = node;
        renameInput.value = node.name;
        renameInput.style.display = 'block';
        updateRenameInputPosition();
        renameInput.focus();
        renameInput.select();
    }
    function updateRenameInputPosition() {
        if (!renamingNode) return;
        const screenPos = worldToScreen(renamingNode.x, renamingNode.y);
        renameInput.style.left = screenPos.x + 'px';
        renameInput.style.top = screenPos.y + 'px';
    }
    function finishRenaming() {
        if (!isRenaming || !renamingNode) return;
        const newName = renameInput.value.trim();
        if (newName) {
            renamingNode.name = newName;
            renamingNode.radius = calculateNodeRadius(newName);
        }
        cancelRenaming();
    }
    function cancelRenaming() {
        isRenaming = false;
        renamingNode = null;
        renameInput.style.display = 'none';
        canvas.focus();
    }
    renameInput.addEventListener('blur', () => setTimeout(() => { if (isRenaming) finishRenaming(); }, 100));

    function spawnNode() {
        const name = "State" + (nodes.length + 1);
        const r = calculateNodeRadius(name);
        // 新增節點時，直接放在滑鼠(右鍵)位置
        const newNode = { 
            id: Date.now(), 
            x: contextMenuPos.x, 
            y: contextMenuPos.y, 
            name, 
            radius: r
        };
        nodes.push(newNode);
        setTimeout(() => startRenaming(newNode), 50);
    }

    function deleteNode(node) {
        edges = edges.filter(edge => edge.from !== node && edge.to !== node);
        nodes = nodes.filter(n => n !== node);
        selectedNode = null;
    }

    function startEdgeCreation(node) { isCreatingEdge = true; dragStartNode = node; }
    function cancelEdgeCreation() { isCreatingEdge = false; dragStartNode = null; }
    function createEdge(n1, n2) {
        const existing = edges.find(e => (e.from === n1 && e.to === n2) || (e.from === n2 && e.to === n1));
        if (!existing) edges.push({ from: n1, to: n2, type: 'directed' });
    }

    // --- 8. 繪圖引擎 ---
    function draw() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();

        ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);

        // 畫連線
        edges.forEach(edge => {
            const isSelected = (edge === selectedEdge);
            ctx.strokeStyle = isSelected ? THEME.edgeSelected : THEME.edge;
            ctx.lineWidth = isSelected ? 3 : 2;
            drawArrow(edge.from, edge.to, edge.type === 'bidirectional', isSelected);
        });

        // 畫建立連線的虛線
        if (isCreatingEdge && dragStartNode) {
            ctx.strokeStyle = '#aaa';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(dragStartNode.x, dragStartNode.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 畫節點
        nodes.forEach(node => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = THEME.nodeFill;
            ctx.fill();
            ctx.lineWidth = 2 / camera.zoom * camera.zoom; 
            ctx.strokeStyle = (node === selectedNode) ? THEME.nodeSelected : THEME.nodeBorder;
            ctx.stroke();
            
            ctx.fillStyle = THEME.nodeText;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.name, node.x, node.y);
        });
    }

    function drawGrid() {
        let gridSize = 40 * camera.zoom;
        while(gridSize < 20) gridSize *= 2;
        while(gridSize > 80) gridSize /= 2;

        const offsetX = camera.x % gridSize;
        const offsetY = camera.y % gridSize;

        ctx.beginPath();
        ctx.strokeStyle = THEME.grid;
        ctx.lineWidth = 1;

        for (let x = offsetX; x < canvas.width; x += gridSize) {
            ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
        }
        for (let y = offsetY; y < canvas.height; y += gridSize) {
            ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();
    }

    function drawArrow(fromNode, toNode, bidirectional, isSelected) {
        const headlen = 10;
        const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
        const startX = fromNode.x + fromNode.radius * Math.cos(angle);
        const startY = fromNode.y + fromNode.radius * Math.sin(angle);
        const endX = toNode.x - toNode.radius * Math.cos(angle);
        const endY = toNode.y - toNode.radius * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.fillStyle = isSelected ? THEME.edgeSelected : THEME.edgeArrow;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        if (bidirectional) {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + headlen * Math.cos(angle - Math.PI / 6), startY + headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(startX + headlen * Math.cos(angle + Math.PI / 6), startY + headlen * Math.sin(angle + Math.PI / 6));
            ctx.fill();
        }
    }

    // --- 9. 碰撞檢測 (點擊判定) ---
    function getNodeAt(x, y) {
        // 反向遍歷，確保先選到上層的節點
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            if (Math.hypot(n.x - x, n.y - y) < n.radius) return n;
        }
        return null;
    }
    function getEdgeAt(x, y) {
        for (let edge of edges) {
            const dist = pointToLineDist(x, y, edge.from.x, edge.from.y, edge.to.x, edge.to.y);
            if (dist < 10) return edge;
        }
        return null;
    }
    function pointToLineDist(px, py, x1, y1, x2, y2) {
        const A = px - x1; const B = py - y1; const C = x2 - x1; const D = y2 - y1;
        const dot = A * C + B * D; const len_sq = C * C + D * D;
        let param = -1; if (len_sq != 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; } else if (param > 1) { xx = x2; yy = y2; } else { xx = x1 + param * C; yy = y1 + param * D; }
        const dx = px - xx; const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // --- 10. JSON 匯入匯出 ---
    function generateJSON() {
        document.getElementById('codeOutput').value = JSON.stringify(buildJSONObj(), null, 2);
        document.getElementById('codeModal').style.display = 'flex';
    }
    function downloadJSON() {
        const json = document.getElementById('codeOutput').value || JSON.stringify(buildJSONObj(), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        let filename = projectTitle.value.trim();
        if(!filename || filename === 'Untitled') filename = 'graph_adj_list';
        a.download = `${filename}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    function downloadJSONFromModal() { downloadJSON(); }
    
    function buildJSONObj() {
        let adjList = {};
        [...nodes].sort((a,b)=>a.name.localeCompare(b.name)).forEach(node => {
            let neighbors = [];
            edges.forEach(edge => {
                if(edge.from === node) neighbors.push(edge.to.name);
                else if(edge.to === node && edge.type === 'bidirectional') neighbors.push(edge.from.name);
            });
            adjList[node.name] = [...new Set(neighbors)].sort();
        });
        return adjList;
    }

    function importJSON(input) {
        const file = input.files[0];
        if (!file) return;
        const fileNameWithoutExt = file.name.replace(/\.json$/i, "");
        projectTitle.value = fileNameWithoutExt;
        updateTitleStyle();
        const reader = new FileReader();
        reader.onload = function(e) {
            try { parseAndDrawJSON(JSON.parse(e.target.result)); } catch (err) { alert("JSON 格式錯誤"); }
            input.value = '';
        };
        reader.readAsText(file);
    }

    function parseAndDrawJSON(data) {
        nodes = []; edges = [];
        const nodeSet = new Set();
        Object.keys(data).forEach(k => {
            nodeSet.add(k); if (Array.isArray(data[k])) data[k].forEach(n => nodeSet.add(n));
        });
        const allNodeNames = Array.from(nodeSet).sort();
        
        // 載入時隨機分佈
        allNodeNames.forEach((name) => {
            nodes.push({
                id: name, name: name,
                x: (Math.random()-0.5)*300, y: (Math.random()-0.5)*300,
                radius: calculateNodeRadius(name)
            });
        });
        const nodeMap = {}; nodes.forEach(n => nodeMap[n.name] = n);
        const createdConnections = new Set();
        Object.keys(data).forEach(src => {
            const sourceNode = nodeMap[src];
            if (sourceNode && Array.isArray(data[src])) {
                data[src].forEach(tgt => {
                    const targetNode = nodeMap[tgt];
                    if (!targetNode) return;
                    const reverseExists = data[tgt] && data[tgt].includes(src);
                    const pairKey = [src, tgt].sort().join('-');
                    if (createdConnections.has(pairKey)) return;
                    edges.push({ from: sourceNode, to: targetNode, type: reverseExists ? 'bidirectional' : 'directed' });
                    if (reverseExists) createdConnections.add(pairKey);
                });
            }
        });
        // 載入後重置相機
        camera.x = canvas.width / 2; camera.y = canvas.height / 2; camera.zoom = 1;
        draw();
    }

    // --- 11. Modal 視窗 ---
    function openConfirmModal() { document.getElementById('confirmModal').style.display = 'flex'; }
    function confirmClearCanvas() { nodes = []; edges = []; projectTitle.value = 'Untitled'; updateTitleStyle(); closeModal('confirmModal'); }
    function closeModal(id) { document.getElementById(id).style.display = 'none'; }
});