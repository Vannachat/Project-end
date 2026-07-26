import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// --- SECURITY ---
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', (e) => {
    if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && e.keyCode === 73) || (e.ctrlKey && e.keyCode === 85)) {
        e.preventDefault();
        return false;
    }
});

// --- MASTER PRICE TABLE (บาท/หน่วย) ---
let priceDB = {
    cement: 140, // บาท/ถุง (50กก.)
    sand: 550,   // บาท/คิว
    stone: 600   // บาท/คิว
};

// --- GUI UTILS ---
window.toggleWindow = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = (el.style.display === 'flex' || el.style.display === 'block') ? 'none' : 'flex';
    if (el.style.display === 'flex') bringToFront(el);
    updateTaskbar();
};

window.closeWindow = function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
    updateTaskbar();
};

function updateTaskbar() {
    ['panel-tools', 'panel-outliner', 'panel-calc', 'panel-price'].forEach((pid, idx) => {
        const el = document.getElementById(pid);
        const btnId = ['tb-tools', 'tb-outliner', 'tb-calc', 'tb-price'][idx];
        const btn = document.getElementById(btnId);
        if (el && btn) {
            if (el.style.display === 'flex' || el.style.display === 'block') btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
}

function bringToFront(el) {
    document.querySelectorAll('.window-panel').forEach(p => p.style.zIndex = 10);
    el.style.zIndex = 11;
}

function makeDraggable(elmnt) {
    if (!elmnt) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = document.getElementById(elmnt.id + "-header");
    if (header) header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        bringToFront(elmnt);
    }
    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

['panel-tools', 'panel-outliner', 'panel-calc', 'panel-price'].forEach(id => makeDraggable(document.getElementById(id)));

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121016);

const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(8, 8, 10);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 12, 7);
scene.add(dirLight);

const gridHelper = new THREE.GridHelper(20, 20, 0x9b59b6, 0x3a2b4c);
scene.add(gridHelper);
scene.add(new THREE.AxesHelper(2));

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transformControl = new TransformControls(camera, renderer.domElement);
transformControl.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
});
scene.add(transformControl);

let objects = [];
let selectedObject = null;
let outlineHelper = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// --- DIMENSION LABELS ---
const dimLabels = {
    x: createDimensionInput('x'),
    y: createDimensionInput('y'),
    z: createDimensionInput('z')
};

transformControl.addEventListener('change', () => {
    if (!selectedObject) return;
    updatePosInputsFromObject();
    updateDimensionLabels();
    updateRealtimeCalc();
});

function createDimensionInput(axis) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.className = `dimension-input label-${axis}`;
    input.addEventListener('change', () => {
        if (!selectedObject) return;
        const newSize = parseFloat(input.value);
        if (!isNaN(newSize) && newSize > 0) resizeObject(selectedObject, axis, newSize);
    });
    ['pointerdown', 'mousedown', 'keydown'].forEach(evt => input.addEventListener(evt, e => e.stopPropagation()));

    const obj = new CSS2DObject(input);
    obj.visible = false;
    scene.add(obj);
    return { dom: input, obj: obj };
}

function updateDimensionLabels() {
    if (!selectedObject || !selectedObject.visible) {
        Object.values(dimLabels).forEach(l => l.obj.visible = false);
        return;
    }
    const box = new THREE.Box3().setFromObject(selectedObject);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    if (document.activeElement !== dimLabels.x.dom) dimLabels.x.dom.value = size.x.toFixed(2);
    if (document.activeElement !== dimLabels.y.dom) dimLabels.y.dom.value = size.y.toFixed(2);
    if (document.activeElement !== dimLabels.z.dom) dimLabels.z.dom.value = size.z.toFixed(2);

    dimLabels.x.obj.position.set(center.x, center.y - size.y / 2 - 0.4, center.z + size.z / 2);
    dimLabels.y.obj.position.set(center.x + size.x / 2 + 0.4, center.y, center.z + size.z / 2);
    dimLabels.z.obj.position.set(center.x - size.x / 2, center.y - size.y / 2 - 0.4, center.z);
    Object.values(dimLabels).forEach(l => l.obj.visible = true);
}

function resizeObject(obj, axis, targetSize) {
    const box = new THREE.Box3().setFromObject(obj);
    const currentSize = new THREE.Vector3();
    box.getSize(currentSize);
    if (axis === 'x' && currentSize.x > 0) obj.scale.x *= (targetSize / currentSize.x);
    if (axis === 'y' && currentSize.y > 0) obj.scale.y *= (targetSize / currentSize.y);
    if (axis === 'z' && currentSize.z > 0) obj.scale.z *= (targetSize / currentSize.z);
    updateDimensionLabels();
    updateRealtimeCalc();
}

// --- OBJECT MANAGEMENT ---
function addMesh(mesh, name) {
    mesh.userData.name = name || `Structure ${objects.length + 1}`;
    scene.add(mesh);
    objects.push(mesh);
    refreshObjectList();
    selectObject(mesh);
}

function selectObject(obj) {
    selectedObject = obj;
    updateSelectionOutline(obj);

    const propsPanel = document.getElementById('properties-panel');
    if (obj) {
        transformControl.attach(obj);
        updateDimensionLabels();
        updatePosInputsFromObject();
        if (propsPanel) propsPanel.style.display = 'block';
    } else {
        transformControl.detach();
        updateDimensionLabels();
        if (propsPanel) propsPanel.style.display = 'none';
    }
    refreshObjectList();
}

function updateSelectionOutline(obj) {
    if (outlineHelper) {
        scene.remove(outlineHelper);
        if (outlineHelper.geometry) outlineHelper.geometry.dispose();
        outlineHelper = null;
    }
    if (!obj) return;
    const edges = new THREE.EdgesGeometry(obj.geometry);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xb15bde, linewidth: 2 });
    outlineHelper = new THREE.LineSegments(edges, lineMat);
    scene.add(outlineHelper);
}

function refreshObjectList() {
    const list = document.getElementById('object-list');
    if (!list) return;
    list.innerHTML = '';
    objects.forEach(obj => {
        const li = document.createElement('li');
        if (selectedObject === obj) li.classList.add('selected');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'obj-name';
        nameSpan.textContent = obj.userData.name;

        li.onclick = () => selectObject(obj);

        const iconsDiv = document.createElement('div');
        iconsDiv.className = 'list-icon-group';
        
        const delBtn = document.createElement('span');
        delBtn.className = 'icon-btn';
        delBtn.textContent = '❌';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            objects = objects.filter(o => o !== obj);
            if (selectedObject === obj) selectObject(null);
            refreshObjectList();
        };

        iconsDiv.appendChild(delBtn);
        li.appendChild(nameSpan);
        li.appendChild(iconsDiv);
        list.appendChild(li);
    });
}

// --- CALCULATION LOGIC (มทอ. 101-64 + BOQ) ---
window.performCalcAll = function () {
    let totalVolume = 0;
    objects.forEach(obj => {
        if (!obj.visible) return;
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        totalVolume += (size.x * size.y * size.z);
    });

    const wastage = 1.05; // เผื่อเสีย 5%
    const cementBags = Math.ceil((totalVolume * 350 * wastage) / 50);
    const sandCubic = totalVolume * 0.46 * wastage;
    const stoneCubic = totalVolume * 0.85 * wastage;

    // คำนวณราคาสุทธิ (บาท)
    const cementCost = cementBags * priceDB.cement;
    const sandCost = sandCubic * priceDB.sand;
    const stoneCost = stoneCubic * priceDB.stone;
    const totalCost = cementCost + sandCost + stoneCost;

    const reportHTML = `
        <div style="background:#181224; padding:15px; border-radius:8px; border:1px solid #3a2b4c;">
            <h3 style="margin-top:0; color:#9b59b6;">📊 สรุปรายการประมาณราคา (BOQ)</h3>
            <p style="font-size:12px; margin:5px 0;">ชิ้นงานทั้งหมด: <strong>${objects.length}</strong> ชิ้น | ปริมาตรรวม: <strong>${totalVolume.toFixed(3)}</strong> ลบ.ม.</p>
            
            <table>
                <thead>
                    <tr>
                        <th>รายการวัสดุ (มทอ. 101-64)</th>
                        <th>ปริมาณ</th>
                        <th>ราคา/หน่วย</th>
                        <th>จำนวนเงิน (บาท)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>ปูนซีเมนต์ปอร์ตแลนด์ (50กก.)</td>
                        <td>${cementBags} ถุง</td>
                        <td>${priceDB.cement} ฿</td>
                        <td>${cementCost.toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td>ทรายหยาบ</td>
                        <td>${sandCubic.toFixed(2)} คิว</td>
                        <td>${priceDB.sand} ฿</td>
                        <td>${sandCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                    <tr>
                        <td>หินก่อสร้าง (1-2)</td>
                        <td>${stoneCubic.toFixed(2)} คิว</td>
                        <td>${priceDB.stone} ฿</td>
                        <td>${stoneCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                    <tr style="font-weight:bold; background:#231833; color:#2ecc71;">
                        <td colspan="3" style="text-align:right;">ราคาสุทธิรวมทั้งหมด:</td>
                        <td>${totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})} ฿</td>
                    </tr>
                </tbody>
            </table>
            <small style="color:#a393b3; display:block; margin-bottom:10px;">*คำนวณสัดส่วน 1:2:4 รวมอัตราเผื่อสูญเสีย (Wastage Factor 5%) ตามมาตรฐาน มทอ. 101-64</small>
            <button onclick="window.print()" class="calc-btn">🖨️ พิมพ์รายงาน BOQ (Export PDF)</button>
        </div>
    `;

    const el = document.getElementById('calc-result-content');
    if (el) el.innerHTML = reportHTML;
};

function updateRealtimeCalc() {
    const panel = document.getElementById('panel-calc');
    if (panel && panel.style.display !== 'none') {
        window.performCalcAll();
    }
}

// --- PRESET CREATION (PARAMETRIC) ---
document.getElementById('btn-add-wall')?.addEventListener('click', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 0.2), new THREE.MeshLambertMaterial({ color: 0x8e44ad }));
    mesh.position.y = 1.25;
    addMesh(mesh, "Wall Concrete");
});

document.getElementById('btn-add-slab')?.addEventListener('click', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 3), new THREE.MeshLambertMaterial({ color: 0x3498db }));
    mesh.position.y = 0.075;
    addMesh(mesh, "Slab Concrete");
});

document.getElementById('btn-add-column')?.addEventListener('click', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), new THREE.MeshLambertMaterial({ color: 0xe67e22 }));
    mesh.position.y = 1.5;
    addMesh(mesh, "Column Concrete");
});

// --- PRICE SETUP UI ---
document.getElementById('btn-save-prices')?.addEventListener('click', () => {
    priceDB.cement = parseFloat(document.getElementById('inp-price-cement').value) || priceDB.cement;
    priceDB.sand = parseFloat(document.getElementById('inp-price-sand').value) || priceDB.sand;
    priceDB.stone = parseFloat(document.getElementById('inp-price-stone').value) || priceDB.stone;
    alert("บันทึกราคาวัสดุเรียบร้อย!");
    updateRealtimeCalc();
});

// --- INPUT HANDLERS ---
const inpPosX = document.getElementById('inp-pos-x');
const inpPosY = document.getElementById('inp-pos-y');
const inpPosZ = document.getElementById('inp-pos-z');

function updatePosInputsFromObject() {
    if (selectedObject) {
        if (inpPosX) inpPosX.value = selectedObject.position.x.toFixed(2);
        if (inpPosY) inpPosY.value = selectedObject.position.y.toFixed(2);
        if (inpPosZ) inpPosZ.value = selectedObject.position.z.toFixed(2);
    }
}

function applyPosFromInputs() {
    if (selectedObject) {
        const x = parseFloat(inpPosX.value), y = parseFloat(inpPosY.value), z = parseFloat(inpPosZ.value);
        if (!isNaN(x)) selectedObject.position.x = x;
        if (!isNaN(y)) selectedObject.position.y = y;
        if (!isNaN(z)) selectedObject.position.z = z;
        updateDimensionLabels();
    }
}

[inpPosX, inpPosY, inpPosZ].forEach(inp => inp?.addEventListener('input', applyPosFromInputs));

// --- EVENT LISTENERS ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('click', (e) => {
    if (e.target.closest('.window-panel') || e.target.closest('#taskbar') || e.target.tagName === 'INPUT') return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (!transformControl.dragging) {
        const intersects = raycaster.intersectObjects(objects);
        if (intersects.length > 0) selectObject(intersects[0].object);
        else selectObject(null);
    }
});

window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'Delete' && selectedObject) {
        scene.remove(selectedObject);
        objects = objects.filter(o => o !== selectedObject);
        selectObject(null);
    }
    if (e.key.toLowerCase() === 't') transformControl.setMode('translate');
    if (e.key.toLowerCase() === 'r') transformControl.setMode('scale');
    if (e.key.toLowerCase() === 'e') transformControl.setMode('rotate');
});

document.getElementById('btn-calc-all')?.addEventListener('click', () => {
    const el = document.getElementById('panel-calc');
    if (el) {
        el.style.display = 'flex';
        bringToFront(el);
        updateTaskbar();
    }
    window.performCalcAll();
});

// --- ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);
    if (selectedObject && outlineHelper) {
        outlineHelper.position.copy(selectedObject.position);
        outlineHelper.quaternion.copy(selectedObject.quaternion);
        outlineHelper.scale.copy(selectedObject.scale);
    }
    orbit.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}
animate();