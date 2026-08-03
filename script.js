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
// เพิ่มวัสดุใหม่ในอนาคต: เพิ่ม 1 บรรทัดในนี้ แล้วอ้างอิง key ใน MATERIALS ด้านล่าง
const PRICE_META = [
    { key: 'cement', label: 'ปูนซีเมนต์ปอร์ตแลนด์ (บาท / ถุง 50 กก.)', def: 140 },
    { key: 'sand', label: 'ทรายหยาบ (บาท / คิว)', def: 550 },
    { key: 'stone', label: 'หิน 1-2 (บาท / คิว)', def: 600 },
    { key: 'brick', label: 'อิฐมอญ (บาท / ก้อน)', def: 3 },
    { key: 'aac', label: 'อิฐมวลเบา 20×60 ซม. (บาท / ก้อน)', def: 35 },
    { key: 'aacMortar', label: 'ปูนก่อมวลเบาสำเร็จรูป (บาท / ถุง 50 กก.)', def: 150 },
    { key: 'steel', label: 'เหล็กรูปพรรณ (บาท / กก.)', def: 32 },
    { key: 'wood', label: 'ไม้แปรรูป (บาท / ลบ.ม.)', def: 18000 }
];

let priceDB = {};
PRICE_META.forEach(p => priceDB[p.key] = p.def);

const WASTAGE = 1.03;       // เผื่อสูญเสียวัสดุ 3%
const PRICE_BUFFER = 1.03;  // เผื่อความผันผวนราคา 3 เดือน 3%

// helper สร้างแถวรายการวัสดุ 1 แถว
function boqRow(name, qty, unit, priceKey, decimals = 0) {
    return { name, qty, unit, price: priceDB[priceKey], decimals };
}

// --- MATERIAL LIBRARY (คลังวัสดุ – เพิ่ม/แก้ไขได้อิสระ) ---
// m = { volume: ปริมาตรจริง (ลบ.ม.), area: พื้นที่ผนัง (ตร.ม.) = ปริมาตร/ความหนาที่บางสุด }
// วัสดุงานเท (คอนกรีต/เหล็ก/ไม้) คิดจาก volume; วัสดุงานก่อ (อิฐ) คิดจาก area ของผนัง
const MATERIALS = {
    concrete: {
        label: 'คอนกรีตเสริมเหล็ก (ค.ส.ล.)',
        color: 0x8a8f98,
        basis: 'volume',
        note: 'ส่วนผสม 1:2:4 ต่อ 1 ลบ.ม. ใช้ปูน ~324 กก. ทราย 0.57 ลบ.ม. หิน 1.09 ลบ.ม. (อ้างอิง มทช.101-2545 / มยผ.1101-64, ข้อมูลผู้ผลิต SCG)',
        components(m) {
            const v = m.volume;
            return [
                boqRow('ปูนซีเมนต์ปอร์ตแลนด์ (50กก.)', Math.ceil(v * (324 / 50) * WASTAGE), 'ถุง', 'cement'),
                boqRow('ทรายหยาบ', v * 0.57 * WASTAGE, 'คิว', 'sand', 2),
                boqRow('หินก่อสร้าง (1-2)', v * 1.09 * WASTAGE, 'คิว', 'stone', 2)
            ];
        }
    },
    brick: {
        label: 'ผนังก่ออิฐมอญ',
        color: 0xb5651d,
        basis: 'area',
        note: 'ก่อครึ่งแผ่น ~130 ก้อน/ตร.ม. + ปูนก่อ 15 กก. และทราย 0.05 ลบ.ม./ตร.ม. (ก่อหนา ~1.5 ซม.) — ยังไม่รวมงานฉาบ',
        components(m) {
            const a = m.area;
            return [
                boqRow('อิฐมอญ', Math.ceil(a * 130 * WASTAGE), 'ก้อน', 'brick'),
                boqRow('ปูนซีเมนต์ (ปูนก่อ)', Math.ceil(a * (15 / 50) * WASTAGE), 'ถุง', 'cement'),
                boqRow('ทรายหยาบ', a * 0.05 * WASTAGE, 'คิว', 'sand', 2)
            ];
        }
    },
    aac: {
        label: 'ผนังอิฐมวลเบา (AAC)',
        color: 0xd9d2c5,
        basis: 'area',
        note: 'บล็อกมวลเบา 20×60 ซม. 8.33 ก้อน/ตร.ม. + ปูนก่อสำเร็จรูป 1 ถุง/39 ตร.ม. (ก่อหนา 3 มม.) — ยังไม่รวมงานฉาบ',
        components(m) {
            const a = m.area;
            return [
                boqRow('อิฐมวลเบา (AAC)', Math.ceil(a * 8.33 * WASTAGE), 'ก้อน', 'aac'),
                boqRow('ปูนก่อมวลเบาสำเร็จรูป', Math.ceil(a * (1 / 39) * WASTAGE), 'ถุง', 'aacMortar')
            ];
        }
    },
    steel: {
        label: 'โครงสร้างเหล็กรูปพรรณ',
        color: 0x6f7a86,
        basis: 'volume',
        note: 'น้ำหนัก = ปริมาตร × 7,850 กก./ลบ.ม. (ความหนาแน่นเหล็กมาตรฐาน มอก. งานเหล็กโครงสร้าง)',
        components(m) {
            return [
                boqRow('เหล็กรูปพรรณ', m.volume * 7850 * WASTAGE, 'กก.', 'steel', 1)
            ];
        }
    },
    wood: {
        label: 'โครงสร้างไม้',
        color: 0x9c6b3f,
        basis: 'volume',
        note: 'คิดจากปริมาตรไม้แปรรูปสุทธิ (ยังไม่รวมอุปกรณ์ยึด/ตะปู)',
        components(m) {
            return [
                boqRow('ไม้แปรรูป', m.volume * WASTAGE, 'ลบ.ม.', 'wood', 3)
            ];
        }
    }
};

const DEFAULT_MATERIAL = 'concrete';
function getMaterialId(obj) {
    return (obj && obj.userData && MATERIALS[obj.userData.material]) ? obj.userData.material : DEFAULT_MATERIAL;
}

// --- GUI UTILS ---
function isWindowVisible(el) {
    // เช็คจากค่าที่แสดงจริง ไม่ใช่แค่ inline style (กัน bug คลิกครั้งแรกไม่ทำงาน)
    return el && getComputedStyle(el).display !== 'none';
}

window.toggleWindow = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isWindowVisible(el)) {
        el.style.display = 'none';
    } else {
        el.style.display = 'flex';
        bringToFront(el);
    }
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
            if (isWindowVisible(el)) btn.classList.add('active');
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
scene.background = new THREE.Color(0x14161a);

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

const marqueeEl = document.createElement('div');
marqueeEl.className = 'marquee-box';
container.appendChild(marqueeEl);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 8, 12);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 12, 7);
scene.add(dirLight);

const gridHelper = new THREE.GridHelper(20, 20, 0x2e6da4, 0x333a44);
scene.add(gridHelper);
scene.add(new THREE.AxesHelper(2));

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.ROTATE,   // ลากเมาส์กลาง = หมุนมุมมอง (เหมือน SketchUp)
    RIGHT: THREE.MOUSE.PAN
};

const transformControl = new TransformControls(camera, renderer.domElement);
transformControl.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    if (e.value) pushUndo();
});
scene.add(transformControl);

let objects = [];           
let selectedObject = null;  
let outlineHelper = null;
let multiSelected = new Set(); // ชิ้นงานที่ติ๊ก ☑ ไว้ในลิสต์ (สำหรับปุ่ม "รวมกลุ่มที่ติ๊ก")
let dragSourceObj = null;      // ชิ้นงานที่กำลังลากอยู่ (drag & drop ในลิสต์เลเยอร์)
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
        if (!isNaN(newSize) && newSize > 0) {
            pushUndo();
            resizeObject(selectedObject, axis, newSize);
        }
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

function makeBoxMesh(w, h, d, colorHex, name, materialId = DEFAULT_MATERIAL) {
    const matId = MATERIALS[materialId] ? materialId : DEFAULT_MATERIAL;
    const color = (colorHex == null) ? MATERIALS[matId].color : colorHex;
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color })
    );
    mesh.userData.name = name || `Structure ${objects.length + 1}`;
    mesh.userData.material = matId;
    return mesh;
}

// เปลี่ยนวัสดุของชิ้นงาน/กลุ่ม แล้วปรับสีตามวัสดุ
function applyMaterialTo(obj, matId) {
    if (!MATERIALS[matId]) return;
    const recolor = (mesh) => {
        mesh.userData.material = matId;
        if (mesh.material && mesh.material.color) mesh.material.color.setHex(MATERIALS[matId].color);
    };
    if (obj.isGroup) obj.traverse(o => { if (o.isMesh) recolor(o); });
    else if (obj.isMesh) recolor(obj);
}

// อ่านค่าวัสดุที่เลือกจากแผงเครื่องมือ (สำหรับสร้างชิ้นใหม่)
function getSelectedMaterialId() {
    const sel = document.getElementById('sel-material');
    return (sel && MATERIALS[sel.value]) ? sel.value : DEFAULT_MATERIAL;
}

// --- OBJECT MANAGEMENT ---
function addMesh(mesh, name) {
    pushUndo();
    if (name) mesh.userData.name = name;
    if (!mesh.userData.name) mesh.userData.name = `Structure ${objects.length + 1}`;
    scene.add(mesh);
    objects.push(mesh);
    refreshObjectList();
    selectObject(mesh);
    updateRealtimeCalc();
}

function selectObject(obj) {
    selectedObject = obj;
    updateSelectionOutline(obj);

    const propsPanel = document.getElementById('properties-panel');
    if (obj) {
        transformControl.attach(obj);
        if (typeof applyCurrentTool === 'function') applyCurrentTool();
        updateDimensionLabels();
        updatePosInputsFromObject();
        if (typeof syncMaterialDropdown === 'function') syncMaterialDropdown(obj);
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
        outlineHelper.dispose();
        outlineHelper = null;
    }
    if (!obj) return;
    outlineHelper = new THREE.BoxHelper(obj, 0x4a90c2);
    scene.add(outlineHelper);
}

function getTopLevelObject(obj) {
    let cur = obj;
    while (cur.parent && cur.parent !== scene) cur = cur.parent;
    return cur;
}

// --- LAYER PANEL HELPERS (visibility / lock / order / group tree) ---
function isLocked(obj) {
    return !!(obj.userData && obj.userData.locked);
}

// รายการวัตถุระดับบนสุดที่ยังไม่ถูกล็อก (ใช้กรองก่อน raycast/marquee select)
function selectableObjects() {
    return objects.filter(o => !isLocked(o));
}

// อาเรย์ "พี่น้อง" ของวัตถุ (objects ถ้าอยู่บนสุด, หรือ children ของกลุ่มแม่ถ้าอยู่ในกลุ่ม) — ใช้กำหนดลำดับเลเยอร์
function getSiblingArray(obj) {
    const parent = obj.parent;
    if (!parent || parent === scene) return objects;
    return parent.children;
}

function moveObjectOrder(obj, delta) {
    const arr = getSiblingArray(obj);
    const idx = arr.indexOf(obj);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= arr.length) return;
    pushUndo();
    const tmp = arr[idx];
    arr[idx] = arr[newIdx];
    arr[newIdx] = tmp;
    refreshObjectList();
}

function moveObjectToEdge(obj, toFront) {
    const arr = getSiblingArray(obj);
    const idx = arr.indexOf(obj);
    if (idx < 0) return;
    pushUndo();
    arr.splice(idx, 1);
    if (toFront) arr.push(obj); else arr.unshift(obj);
    refreshObjectList();
}

function toggleVisible(obj) {
    obj.visible = !obj.visible;
    if (selectedObject === obj) updateDimensionLabels();
    refreshObjectList();
    updateRealtimeCalc();
}

function toggleLock(obj) {
    obj.userData.locked = !obj.userData.locked;
    if (obj.userData.locked && selectedObject === obj) selectObject(null);
    refreshObjectList();
}

function toggleCollapse(obj) {
    obj.userData.collapsed = !obj.userData.collapsed;
    refreshObjectList();
}

// ติ๊ก/ยกเลิกติ๊กชิ้นงานในลิสต์ (ใช้เลือกหลายชิ้นสำหรับปุ่ม "รวมกลุ่มที่ติ๊ก")
function toggleMultiSelect(obj) {
    if (multiSelected.has(obj)) multiSelected.delete(obj);
    else multiSelected.add(obj);
    refreshObjectList();
}

// ย้ายชิ้นงาน (child) เข้าไปอยู่ในกลุ่ม (group) โดยคงตำแหน่ง/ขนาดในโลกจริงไว้ (ลากวางบนโฟลเดอร์)
function moveObjectIntoGroup(child, group) {
    if (!child || !group || child === group || !group.isGroup) return;
    // กันไม่ให้ลากกลุ่มแม่ไปไว้ในลูกของตัวเอง
    let p = group;
    while (p) { if (p === child) return; p = p.parent; }
    pushUndo();
    group.attach(child);
    objects = objects.filter(o => o !== child);
    multiSelected.delete(child);
    refreshObjectList();
    updateRealtimeCalc();
}

// ย้ายชิ้นงานออกจากกลุ่มกลับไปเป็นระดับบนสุด (ลากออกมาวางพื้นที่ว่างของลิสต์)
function moveObjectToRoot(child) {
    if (!child || !child.parent || child.parent === scene) return;
    pushUndo();
    scene.attach(child);
    if (!objects.includes(child)) objects.push(child);
    refreshObjectList();
    updateRealtimeCalc();
}

function deleteObjectNode(obj) {
    pushUndo();
    const parent = obj.parent;
    if (parent) parent.remove(obj);
    else scene.remove(obj);
    disposeObject(obj);
    objects = objects.filter(o => o !== obj);
    multiSelected.delete(obj);
    if (selectedObject === obj) selectObject(null);
    refreshObjectList();
    updateRealtimeCalc();
}

function duplicateObjectNode(obj) {
    pushUndo();
    const data = serializeObject(obj);
    data.position = [data.position[0] + 0.8, data.position[1], data.position[2] + 0.8];
    data.name = data.name + ' Copy';
    const newObj = buildFromData(data);
    const parent = obj.parent;
    if (parent && parent.isGroup) {
        parent.add(newObj);
    } else {
        scene.add(newObj);
        objects.push(newObj);
    }
    refreshObjectList();
    selectObject(newObj);
    updateRealtimeCalc();
}

// สร้างกลุ่ม/โฟลเดอร์เลเยอร์เปล่า (เหมือนสร้าง Layer Group ใน Photoshop)
function createEmptyGroup() {
    pushUndo();
    const group = new THREE.Group();
    const groupCount = objects.filter(o => o.isGroup).length + 1;
    group.userData.name = `Group ${groupCount}`;
    scene.add(group);
    objects.push(group);
    refreshObjectList();
    selectObject(group);
}

function refreshObjectList() {
    const list = document.getElementById('object-list');
    if (!list) return;
    list.innerHTML = '';
    objects.forEach(obj => renderObjectNode(obj, list, 0));
}

// ลากวางบนพื้นที่ว่างของลิสต์ (ไม่ใช่บนแถวไหน) = ย้ายชิ้นงานออกจากกลุ่มกลับสู่ระดับบนสุด
(function setupOutlinerRootDrop() {
    const list = document.getElementById('object-list');
    if (!list) return;
    list.addEventListener('dragover', (e) => {
        if (!dragSourceObj || e.target !== list) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.classList.add('drag-target-root');
    });
    list.addEventListener('dragleave', (e) => {
        if (e.target === list) list.classList.remove('drag-target-root');
    });
    list.addEventListener('drop', (e) => {
        list.classList.remove('drag-target-root');
        if (dragSourceObj && e.target === list) {
            e.preventDefault();
            moveObjectToRoot(dragSourceObj);
        }
        dragSourceObj = null;
    });
})();

function renderObjectNode(obj, container, depth) {
    const li = document.createElement('li');
    li.style.paddingLeft = (8 + depth * 16) + 'px';
    if (selectedObject === obj) li.classList.add('selected');
    if (isLocked(obj)) li.classList.add('locked-row');
    if (multiSelected.has(obj)) li.classList.add('multi-selected');
    li.onclick = () => {
        if (isLocked(obj)) return;
        if (selectedObject !== obj) selectObject(obj);
    };

    // --- Drag & Drop: ลากชิ้นงานไปวางบนโฟลเดอร์เพื่อย้ายเข้ากลุ่ม หรือวางพื้นที่ว่างเพื่อย้ายออก ---
    li.draggable = !isLocked(obj);
    li.ondragstart = (e) => {
        e.stopPropagation();
        dragSourceObj = obj;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', obj.uuid); } catch (err) { /* noop */ }
    };
    li.ondragend = () => { dragSourceObj = null; };
    if (obj.isGroup) {
        li.ondragover = (e) => {
            if (!dragSourceObj || dragSourceObj === obj) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            li.classList.add('drag-target');
        };
        li.ondragleave = () => li.classList.remove('drag-target');
        li.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            li.classList.remove('drag-target');
            if (dragSourceObj && dragSourceObj !== obj) moveObjectIntoGroup(dragSourceObj, obj);
            dragSourceObj = null;
        };
    }

    // --- แถวหลัก: ไอคอนพับ/กาง, ตา, กุญแจ, ชื่อ ---
    const rowMain = document.createElement('div');
    rowMain.className = 'row-main';

    if (obj.isGroup) {
        const tri = document.createElement('span');
        tri.className = 'tri-toggle';
        tri.textContent = obj.userData.collapsed ? '▶' : '▼';
        tri.title = obj.userData.collapsed ? 'ขยายกลุ่ม' : 'ยุบกลุ่ม';
        tri.onclick = (e) => { e.stopPropagation(); toggleCollapse(obj); };
        rowMain.appendChild(tri);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'tri-spacer';
        rowMain.appendChild(spacer);
    }

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'multi-chk';
    chk.checked = multiSelected.has(obj);
    chk.title = 'ติ๊กเพื่อเลือกไว้รวมกลุ่ม';
    chk.onclick = (e) => { e.stopPropagation(); toggleMultiSelect(obj); };
    rowMain.appendChild(chk);

    const eyeBtn = document.createElement('span');
    eyeBtn.className = 'icon-btn eye-btn' + (obj.visible ? '' : ' off');
    eyeBtn.textContent = obj.visible ? '👁' : '⦸';
    eyeBtn.title = obj.visible ? 'คลิกเพื่อซ่อน' : 'คลิกเพื่อแสดง';
    eyeBtn.onclick = (e) => { e.stopPropagation(); toggleVisible(obj); };
    rowMain.appendChild(eyeBtn);

    const lockBtn = document.createElement('span');
    lockBtn.className = 'icon-btn lock-btn' + (isLocked(obj) ? ' on' : '');
    lockBtn.textContent = isLocked(obj) ? '🔒' : '🔓';
    lockBtn.title = isLocked(obj) ? 'ปลดล็อก' : 'ล็อกชิ้นนี้';
    lockBtn.onclick = (e) => { e.stopPropagation(); toggleLock(obj); };
    rowMain.appendChild(lockBtn);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'obj-name';
    const icon = obj.isGroup ? '📁' : '▢';
    const suffix = obj.isGroup
        ? ` (${obj.children.length})`
        : ` · ${MATERIALS[getMaterialId(obj)].label}`;
    nameSpan.textContent = `${icon} ${obj.userData.name}${suffix}`;
    nameSpan.ondblclick = (e) => {
        e.stopPropagation();
        if (isLocked(obj)) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'obj-name-edit';
        input.value = obj.userData.name;
        const commit = () => {
            pushUndo();
            obj.userData.name = input.value.trim() || obj.userData.name;
            refreshObjectList();
        };
        input.onblur = commit;
        input.onkeydown = (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') input.blur();
            if (ev.key === 'Escape') { input.value = obj.userData.name; input.blur(); }
        };
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
    };
    rowMain.appendChild(nameSpan);
    li.appendChild(rowMain);

    // --- แถวไอคอน: ลำดับเลเยอร์ + คัดลอก + (แยกกลุ่ม) + ลบ ---
    const iconsDiv = document.createElement('div');
    iconsDiv.className = 'list-icon-group';

    const mkIcon = (label, title, onClick) => {
        const btn = document.createElement('span');
        btn.className = 'icon-btn';
        btn.textContent = label;
        btn.title = title;
        btn.onclick = (e) => { e.stopPropagation(); onClick(); };
        return btn;
    };

    iconsDiv.appendChild(mkIcon('⤒', 'ย้ายไว้หน้าสุด (Bring to Front)', () => moveObjectToEdge(obj, true)));
    iconsDiv.appendChild(mkIcon('↑', 'ย้ายขึ้น', () => moveObjectOrder(obj, -1)));
    iconsDiv.appendChild(mkIcon('↓', 'ย้ายลง', () => moveObjectOrder(obj, 1)));
    iconsDiv.appendChild(mkIcon('⤓', 'ย้ายไว้หลังสุด (Send to Back)', () => moveObjectToEdge(obj, false)));
    iconsDiv.appendChild(mkIcon('⧉', 'คัดลอกชิ้นนี้ (Duplicate Layer)', () => duplicateObjectNode(obj)));
    if (obj.isGroup) {
        iconsDiv.appendChild(mkIcon('Ungroup', 'แยกกลุ่ม', () => { selectObject(obj); ungroupSelected(); }));
    }
    iconsDiv.appendChild(mkIcon('✕', 'ลบชิ้นนี้', () => deleteObjectNode(obj)));

    li.appendChild(iconsDiv);
    container.appendChild(li);

    if (obj.isGroup && !obj.userData.collapsed) {
        obj.children.forEach(child => renderObjectNode(child, container, depth + 1));
    }
}

// คืนหน่วยความจำ geometry/material ของ mesh ทุกชั้น (รวมลูกในกลุ่ม)
function disposeObject(obj) {
    obj.traverse(o => {
        if (o.isMesh) {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        }
    });
}

function clearAllObjects() {
    pushUndo();
    selectObject(null);
    objects.forEach(obj => {
        scene.remove(obj);
        disposeObject(obj);
    });
    objects = [];
    multiSelected.clear();
    refreshObjectList();
    updateRealtimeCalc();
}

document.getElementById('btn-clear-all')?.addEventListener('click', () => {
    if (confirm("คุณต้องการล้างฉากทั้งหมดใช่หรือไม่?")) {
        clearAllObjects();
    }
});

function createGroupFromObjects(list) {
    if (list.length < 2) return;
    pushUndo();
    const group = new THREE.Group();
    const groupCount = objects.filter(o => o.isGroup).length + 1;
    group.userData.name = `Group ${groupCount}`;
    scene.add(group);

    list.forEach(obj => group.attach(obj));

    objects = objects.filter(o => !list.includes(o));
    objects.push(group);

    refreshObjectList();
    selectObject(group);
    updateRealtimeCalc();
}

function ungroupSelected() {
    if (!selectedObject || !selectedObject.isGroup) return;
    pushUndo();
    const group = selectedObject;
    [...group.children].forEach(child => {
        scene.attach(child);
        objects.push(child);
    });
    scene.remove(group);
    objects = objects.filter(o => o !== group);
    selectObject(null);
    refreshObjectList();
    updateRealtimeCalc();
}

function addPresetGroup(name, meshBuilders) {
    const group = new THREE.Group();
    group.userData.name = name;
    scene.add(group);
    meshBuilders.forEach(({ mesh, pos }) => {
        mesh.position.set(...pos);
        group.add(mesh);
    });
    objects.push(group);
    refreshObjectList();
    selectObject(group);
    updateRealtimeCalc();
}

// 0. Preset House
document.getElementById('btn-preset-house')?.addEventListener('click', () => {
    clearAllObjects();
    pushUndo();

    const colColor = 0xa77b4d;
    const wallColor = 0x5d7a99;
    const slabColor = 0x8a8f98;

    const W = 6.0, D = 8.0;
    const halfW = W / 2, halfD = D / 2;
    const colHalf = 0.125;
    const slabTop = 0.15;
    const wallH = 2.7;
    const wallCenterY = slabTop + wallH / 2;
    const beamH = 0.25;
    const beamCenterY = slabTop + wallH + beamH / 2;
    const colHeight = wallH + beamH;
    const colCenterY = slabTop + colHeight / 2;

    const doorHalf = 0.5;
    const doorHeadY = slabTop + 2.1;
    const lintelH = wallH - 2.1;
    const lintelCenterY = doorHeadY + lintelH / 2;

    const winHalf = 0.75;
    const sillH = 0.9;
    const sillCenterY = slabTop + sillH / 2;
    const winHeadY = slabTop + sillH + 1.2;
    const winLintelH = wallH - sillH - 1.2;
    const winLintelCenterY = winHeadY + winLintelH / 2;
    const winZ = -2.0;

    const parts = [
        { mesh: makeBoxMesh(W + 0.4, 0.15, D + 0.4, slabColor, 'Floor Slab'), pos: [0, 0.075, 0] },
        { mesh: makeBoxMesh(0.25, colHeight, 0.25, colColor, 'Column C1 (Front-Left)'), pos: [-halfW, colCenterY, halfD] },
        { mesh: makeBoxMesh(0.25, colHeight, 0.25, colColor, 'Column C2 (Front-Right)'), pos: [halfW, colCenterY, halfD] },
        { mesh: makeBoxMesh(0.25, colHeight, 0.25, colColor, 'Column C3 (Back-Left)'), pos: [-halfW, colCenterY, -halfD] },
        { mesh: makeBoxMesh(0.25, colHeight, 0.25, colColor, 'Column C4 (Back-Right)'), pos: [halfW, colCenterY, -halfD] },
        { mesh: makeBoxMesh(0.25, colHeight, 0.25, colColor, 'Column C5 (Left-Mid)'), pos: [-halfW, colCenterY, 0] },
        { mesh: makeBoxMesh(0.25, colHeight, 0.25, colColor, 'Column C6 (Right-Mid)'), pos: [halfW, colCenterY, 0] },
        { mesh: makeBoxMesh(W - 2 * colHalf, wallH, 0.2, wallColor, 'Back Wall'), pos: [0, wallCenterY, -halfD] },
        { mesh: makeBoxMesh((halfW - colHalf) - doorHalf, wallH, 0.2, wallColor, 'Front Wall Left'), pos: [-(doorHalf + (halfW - colHalf)) / 2, wallCenterY, halfD] },
        { mesh: makeBoxMesh((halfW - colHalf) - doorHalf, wallH, 0.2, wallColor, 'Front Wall Right'), pos: [(doorHalf + (halfW - colHalf)) / 2, wallCenterY, halfD] },
        { mesh: makeBoxMesh(doorHalf * 2, lintelH, 0.2, wallColor, 'Door Lintel'), pos: [0, lintelCenterY, halfD] },
        { mesh: makeBoxMesh(0.2, wallH, (winZ - winHalf) - (-halfD + colHalf), wallColor, 'Left Wall Segment A'), pos: [-halfW, wallCenterY, (winZ - winHalf + (-halfD + colHalf)) / 2] },
        { mesh: makeBoxMesh(0.2, sillH, winHalf * 2, wallColor, 'Left Window Sill'), pos: [-halfW, sillCenterY, winZ] },
        { mesh: makeBoxMesh(0.2, winLintelH, winHalf * 2, wallColor, 'Left Window Lintel'), pos: [-halfW, winLintelCenterY, winZ] },
        { mesh: makeBoxMesh(0.2, wallH, (0 - colHalf) - (winZ + winHalf), wallColor, 'Left Wall Segment B'), pos: [-halfW, wallCenterY, ((0 - colHalf) + (winZ + winHalf)) / 2] },
        { mesh: makeBoxMesh(0.2, wallH, (halfD - colHalf) - (0 + colHalf), wallColor, 'Left Wall Segment C'), pos: [-halfW, wallCenterY, ((halfD - colHalf) + (0 + colHalf)) / 2] },
        { mesh: makeBoxMesh(0.2, wallH, (winZ - winHalf) - (-halfD + colHalf), wallColor, 'Right Wall Segment A'), pos: [halfW, wallCenterY, (winZ - winHalf + (-halfD + colHalf)) / 2] },
        { mesh: makeBoxMesh(0.2, sillH, winHalf * 2, wallColor, 'Right Window Sill'), pos: [halfW, sillCenterY, winZ] },
        { mesh: makeBoxMesh(0.2, winLintelH, winHalf * 2, wallColor, 'Right Window Lintel'), pos: [halfW, winLintelCenterY, winZ] },
        { mesh: makeBoxMesh(0.2, wallH, (0 - colHalf) - (winZ + winHalf), wallColor, 'Right Wall Segment B'), pos: [halfW, wallCenterY, ((0 - colHalf) + (winZ + winHalf)) / 2] },
        { mesh: makeBoxMesh(0.2, wallH, (halfD - colHalf) - (0 + colHalf), wallColor, 'Right Wall Segment C'), pos: [halfW, wallCenterY, ((halfD - colHalf) + (0 + colHalf)) / 2] },
        { mesh: makeBoxMesh(W - 2 * colHalf, beamH, 0.25, colColor, 'Tie Beam Front'), pos: [0, beamCenterY, halfD] },
        { mesh: makeBoxMesh(W - 2 * colHalf, beamH, 0.25, colColor, 'Tie Beam Back'), pos: [0, beamCenterY, -halfD] },
        { mesh: makeBoxMesh(0.25, beamH, (0 - colHalf) - (-halfD + colHalf), colColor, 'Tie Beam Left Back-Mid'), pos: [-halfW, beamCenterY, ((0 - colHalf) + (-halfD + colHalf)) / 2] },
        { mesh: makeBoxMesh(0.25, beamH, (halfD - colHalf) - (0 + colHalf), colColor, 'Tie Beam Left Mid-Front'), pos: [-halfW, beamCenterY, ((halfD - colHalf) + (0 + colHalf)) / 2] },
        { mesh: makeBoxMesh(0.25, beamH, (0 - colHalf) - (-halfD + colHalf), colColor, 'Tie Beam Right Back-Mid'), pos: [halfW, beamCenterY, ((0 - colHalf) + (-halfD + colHalf)) / 2] },
        { mesh: makeBoxMesh(0.25, beamH, (halfD - colHalf) - (0 + colHalf), colColor, 'Tie Beam Right Mid-Front'), pos: [halfW, beamCenterY, ((halfD - colHalf) + (0 + colHalf)) / 2] },
        { mesh: makeBoxMesh(W + 0.6, 0.15, D + 0.6, slabColor, 'Roof Slab'), pos: [0, beamCenterY + beamH / 2 + 0.075, 0] },
    ];

    tagPresetMaterials(parts);
    addPresetGroup('House Preset (Single Story)', parts);
});

// กำหนดวัสดุอัตโนมัติตามชื่อชิ้นงานของ preset (ผนัง=อิฐมอญ, ที่เหลือ=คอนกรีต)
function tagPresetMaterials(parts) {
    parts.forEach(({ mesh }) => {
        const n = (mesh.userData.name || '').toLowerCase();
        if (n.includes('wall') || n.includes('sill') || n.includes('lintel')) {
            mesh.userData.material = 'brick';
        } else {
            mesh.userData.material = 'concrete';
        }
    });
}

// 1. Preset ตัวอย่างวัสดุครบ (คอนกรีต + อิฐมอญ + อิฐมวลเบา + เหล็ก + ไม้)
document.getElementById('btn-preset-mixed')?.addEventListener('click', () => {
    clearAllObjects();
    pushUndo();

    const slabTop = 0.15;
    const wallH = 2.7;
    const wallCenterY = slabTop + wallH / 2;
    const W = 5.0, D = 4.0;
    const halfW = W / 2, halfD = D / 2;
    const colH = wallH + 0.25;
    const colY = slabTop + colH / 2;
    const beamY = slabTop + wallH + 0.125;
    const roofY = beamY + 0.125 + 0.05;

    // makeBoxMesh(w,h,d,color=null→ใช้สีวัสดุ, name, materialId)
    const parts = [
        // คอนกรีต: พื้น เสา คาน
        { mesh: makeBoxMesh(W + 0.4, 0.15, D + 0.4, null, 'พื้น ค.ส.ล.', 'concrete'), pos: [0, 0.075, 0] },
        { mesh: makeBoxMesh(0.25, colH, 0.25, null, 'เสา ค.ส.ล. C1', 'concrete'), pos: [-halfW, colY, halfD] },
        { mesh: makeBoxMesh(0.25, colH, 0.25, null, 'เสา ค.ส.ล. C2', 'concrete'), pos: [halfW, colY, halfD] },
        { mesh: makeBoxMesh(0.25, colH, 0.25, null, 'เสา ค.ส.ล. C3', 'concrete'), pos: [-halfW, colY, -halfD] },
        { mesh: makeBoxMesh(0.25, colH, 0.25, null, 'เสา ค.ส.ล. C4', 'concrete'), pos: [halfW, colY, -halfD] },
        { mesh: makeBoxMesh(W, 0.25, 0.25, null, 'คาน ค.ส.ล. หน้า', 'concrete'), pos: [0, beamY, halfD] },
        { mesh: makeBoxMesh(W, 0.25, 0.25, null, 'คาน ค.ส.ล. หลัง', 'concrete'), pos: [0, beamY, -halfD] },
        // อิฐมอญ: ผนังหลัง
        { mesh: makeBoxMesh(W - 0.25, wallH, 0.10, null, 'ผนังอิฐมอญ (หลัง)', 'brick'), pos: [0, wallCenterY, -halfD] },
        // อิฐมวลเบา: ผนังซ้าย
        { mesh: makeBoxMesh(0.075, wallH, D - 0.25, null, 'ผนังอิฐมวลเบา (ซ้าย)', 'aac'), pos: [-halfW, wallCenterY, 0] },
        // เหล็ก: คานหลังคา (จันทัน)
        { mesh: makeBoxMesh(W + 0.4, 0.15, 0.1, null, 'คานเหล็กหลังคา', 'steel'), pos: [0, roofY, -halfD] },
        { mesh: makeBoxMesh(W + 0.4, 0.15, 0.1, null, 'คานเหล็กหลังคา 2', 'steel'), pos: [0, roofY, halfD] },
        // ไม้: แปไม้ + ระแนง
        { mesh: makeBoxMesh(0.05, 0.1, D + 0.4, null, 'แปไม้ 1', 'wood'), pos: [-1.2, roofY + 0.12, 0] },
        { mesh: makeBoxMesh(0.05, 0.1, D + 0.4, null, 'แปไม้ 2', 'wood'), pos: [0, roofY + 0.12, 0] },
        { mesh: makeBoxMesh(0.05, 0.1, D + 0.4, null, 'แปไม้ 3', 'wood'), pos: [1.2, roofY + 0.12, 0] },
    ];

    addPresetGroup('ตัวอย่างวัสดุครบ (Mixed Materials)', parts);
});

// --- SINGLE CREATION BUTTONS ---
document.getElementById('btn-add-wall')?.addEventListener('click', () => {
    const mat = getSelectedMaterialId();
    const mesh = makeBoxMesh(3, 2.5, 0.2, null, `ผนัง (${MATERIALS[mat].label})`, mat);
    mesh.position.y = 1.25;
    addMesh(mesh);
});

document.getElementById('btn-add-slab')?.addEventListener('click', () => {
    const mat = getSelectedMaterialId();
    const mesh = makeBoxMesh(3, 0.15, 3, null, `พื้น (${MATERIALS[mat].label})`, mat);
    mesh.position.y = 0.075;
    addMesh(mesh);
});

document.getElementById('btn-add-column')?.addEventListener('click', () => {
    const mat = getSelectedMaterialId();
    const mesh = makeBoxMesh(0.3, 3, 0.3, null, `เสา (${MATERIALS[mat].label})`, mat);
    mesh.position.y = 1.5;
    addMesh(mesh);
});

// --- CALCULATION LOGIC (มยผ. 1101-64 + BOQ, รองรับหลายวัสดุ) ---
// ปริมาตร + พื้นที่ผนังของ mesh โดยคิด world scale
// (แก้บั๊ก: ปริมาตรผิดเมื่อย่อ/ขยายทั้งกลุ่ม; พื้นที่ผนัง = ปริมาตร/ความหนาที่บางสุด)
function meshMetrics(mesh) {
    const p = mesh.geometry && mesh.geometry.parameters;
    const s = new THREE.Vector3();
    mesh.getWorldScale(s);
    let dims;
    if (p && p.width != null) {
        dims = [Math.abs(p.width * s.x), Math.abs(p.height * s.y), Math.abs(p.depth * s.z)];
    } else {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        dims = [size.x, size.y, size.z];
    }
    const volume = dims[0] * dims[1] * dims[2];
    dims.sort((a, b) => a - b);
    const thickness = dims[0];
    const area = thickness > 1e-6 ? volume / thickness : 0; // พื้นที่หน้าผนัง = ด้านกว้าง×ด้านยาว
    return { volume, area };
}

// รวมปริมาตร+พื้นที่แยกตามวัสดุ (เดินลูกทุกชั้นของกลุ่ม)
function collectMetrics(list) {
    scene.updateMatrixWorld(true);
    const byMat = {};
    let totalVolume = 0;
    const walk = (obj) => {
        if (obj.isMesh && obj.geometry) {
            const matId = getMaterialId(obj);
            const mm = meshMetrics(obj);
            if (!byMat[matId]) byMat[matId] = { volume: 0, area: 0, count: 0 };
            byMat[matId].volume += mm.volume;
            byMat[matId].area += mm.area;
            byMat[matId].count += 1;
            totalVolume += mm.volume;
        }
        if (obj.children) obj.children.forEach(walk);
    };
    list.forEach(walk);
    return { byMat, totalVolume };
}

function money(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(row) {
    return row.decimals
        ? row.qty.toLocaleString(undefined, { minimumFractionDigits: row.decimals, maximumFractionDigits: row.decimals })
        : Math.round(row.qty).toLocaleString();
}

function buildBOQReport(objList, label, topCount) {
    const { byMat, totalVolume } = collectMetrics(objList);
    const matIds = Object.keys(byMat).filter(m => byMat[m].volume > 1e-9);

    if (matIds.length === 0) {
        return `<div style="background:#14171c; padding:15px; border-radius:4px; border:1px solid #333a44; color:#98a1ab; text-align:center;">
            ยังไม่มีชิ้นงานสำหรับคำนวณ
        </div>`;
    }

    let grandTotal = 0;
    let sections = '';

    matIds.forEach(matId => {
        const mat = MATERIALS[matId];
        const m = byMat[matId];
        const basisText = mat.basis === 'area'
            ? `${m.area.toFixed(2)} ตร.ม.`
            : `${m.volume.toFixed(3)} ลบ.ม.`;
        let matTotal = 0;
        const rowsHtml = mat.components(m).map(r => {
            const cost = r.qty * r.price * PRICE_BUFFER;
            matTotal += cost;
            return `<tr>
                <td>${r.name}</td>
                <td>${fmtQty(r)} ${r.unit}</td>
                <td>${r.price.toLocaleString()} ฿</td>
                <td>${money(cost)}</td>
            </tr>`;
        }).join('');
        grandTotal += matTotal;

        sections += `
            <div style="margin-bottom:16px;">
                <h4 style="color:#4a90c2; text-transform:none; margin:4px 0 6px;">
                    ${mat.label} — ${basisText} (${m.count} ชิ้น)
                </h4>
                <table>
                    <thead>
                        <tr><th>รายการวัสดุ</th><th>ปริมาณ</th><th>ราคา/หน่วย</th><th>จำนวนเงิน (บาท)</th></tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                        <tr style="font-weight:bold; background:#1c2027; color:#4a90c2;">
                            <td colspan="3" style="text-align:right;">รวมหมวด ${mat.label}:</td>
                            <td>${money(matTotal)} ฿</td>
                        </tr>
                    </tbody>
                </table>
                <small style="color:#98a1ab; display:block; line-height:1.5;">* ${mat.note}</small>
            </div>`;
    });

    return `
        <div style="background:#14171c; padding:15px; border-radius:4px; border:1px solid #333a44;">
            <h3 style="margin-top:0; color:#4a90c2;">${label}</h3>
            <p style="font-size:12px; margin:5px 0 12px;">ชิ้นงานหลัก: <strong>${topCount}</strong> | ปริมาตรรวม: <strong>${totalVolume.toFixed(3)}</strong> ลบ.ม. | จำนวนวัสดุ: <strong>${matIds.length}</strong> ชนิด</p>
            ${sections}
            <div style="background:#1c2027; border:1px solid #3aa563; border-radius:4px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:700; color:#e8eaed;">ราคาสุทธิรวมทั้งโครงการ</span>
                <span style="font-weight:700; font-size:15px; color:#3aa563;">${money(grandTotal)} ฿</span>
            </div>
            <small style="color:#98a1ab; display:block; line-height:1.5;">
                <strong style="color:#c3ccd6;">มาตรฐานอ้างอิงค่าถอดวัสดุ</strong><br>
                • งานคอนกรีต 1:2:4 — มทช. 101-2545 / มยผ. 1101-64 (ค่าต่อหน่วยอ้างอิงข้อมูลผู้ผลิต SCG)<br>
                • งานก่ออิฐมอญ/อิฐมวลเบา — ค่าถอดแบบงานก่อทั่วไป (อิฐมอญ ~130 ก้อน/ตร.ม., AAC 8.33 ก้อน/ตร.ม.)<br>
                • งานเหล็ก — ความหนาแน่น 7,850 กก./ลบ.ม.<br>
                • รวมเผื่อสูญเสียวัสดุ 3% และเผื่อความผันผวนราคา 3 เดือน 3%<br>
                • ราคาต่อหน่วยเป็นค่าอ้างอิงท้องตลาด มิใช่ราคากลางกรมการค้าภายใน โปรดปรับใน "ตั้งค่าราคาวัสดุ" ให้ตรงพื้นที่จริงก่อนใช้อ้างอิง
            </small>
        </div>
    `;
}

window.performCalcAll = function () {
    const visible = objects.filter(o => o.visible);
    const el = document.getElementById('calc-result-content');
    if (el) el.innerHTML = buildBOQReport(visible, 'สรุปรายการประมาณราคา (ทั้งโปรเจค)', visible.length);
};

window.calcSelectedObject = function () {
    if (!selectedObject) {
        alert("กรุณาเลือกชิ้นงานหรือกลุ่มก่อน");
        return;
    }
    const topCount = selectedObject.isGroup ? selectedObject.children.length : 1;

    const panel = document.getElementById('panel-calc');
    if (panel) {
        panel.style.display = 'flex';
        bringToFront(panel);
        updateTaskbar();
    }
    const el = document.getElementById('calc-result-content');
    if (el) el.innerHTML = buildBOQReport([selectedObject], `คำนวณเฉพาะ: ${selectedObject.userData.name}`, topCount);
};

document.getElementById('btn-calc-selected')?.addEventListener('click', () => window.calcSelectedObject());

function updateRealtimeCalc() {
    const panel = document.getElementById('panel-calc');
    if (isWindowVisible(panel)) {
        window.performCalcAll();
    }
}

// --- PRICE SETUP UI ---
document.getElementById('btn-save-prices')?.addEventListener('click', () => {
    PRICE_META.forEach(p => {
        const inp = document.getElementById('inp-price-' + p.key);
        if (inp) {
            const v = parseFloat(inp.value);
            if (!isNaN(v) && v >= 0) priceDB[p.key] = v;
        }
    });
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

// --- UNDO / REDO / COPY / PASTE SYSTEM ---
let undoStack = [];
let redoStack = [];
const UNDO_LIMIT = 40;
let clipboardData = null;

function snapshotCurrent() {
    return JSON.stringify(objects.map(o => serializeObject(o)));
}

function serializeObject(obj) {
    if (obj.isGroup) {
        return {
            type: 'group',
            name: obj.userData.name,
            position: obj.position.toArray(),
            rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            scale: obj.scale.toArray(),
            children: obj.children.map(c => serializeObject(c))
        };
    }
    return {
        type: 'mesh',
        name: obj.userData.name,
        material: obj.userData.material || DEFAULT_MATERIAL,
        size: {
            w: obj.geometry.parameters.width,
            h: obj.geometry.parameters.height,
            d: obj.geometry.parameters.depth
        },
        color: '#' + obj.material.color.getHexString(),
        position: obj.position.toArray(),
        rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
        scale: obj.scale.toArray()
    };
}

function buildFromData(data) {
    if (data.type === 'group') {
        const g = new THREE.Group();
        g.userData.name = data.name;
        g.position.fromArray(data.position);
        g.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
        g.scale.fromArray(data.scale);
        data.children.forEach(cd => g.add(buildFromData(cd)));
        return g;
    }
    const mesh = makeBoxMesh(data.size.w, data.size.h, data.size.d, data.color, data.name, data.material || DEFAULT_MATERIAL);
    mesh.position.fromArray(data.position);
    mesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
    mesh.scale.fromArray(data.scale);
    return mesh;
}

function pushUndo() {
    undoStack.push(snapshotCurrent());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = []; // การกระทำใหม่ล้างประวัติ redo
}

function restoreSnapshot(snapshotJSON) {
    objects.forEach(o => { scene.remove(o); disposeObject(o); });
    objects = [];
    const data = JSON.parse(snapshotJSON);
    data.forEach(d => {
        const obj = buildFromData(d);
        scene.add(obj);
        objects.push(obj);
    });
    selectObject(null);
    refreshObjectList();
    updateRealtimeCalc();
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(snapshotCurrent());
    const prev = undoStack.pop();
    restoreSnapshot(prev);
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(snapshotCurrent());
    const next = redoStack.pop();
    restoreSnapshot(next);
}

function copySelected() {
    if (!selectedObject) return;
    clipboardData = serializeObject(selectedObject);
}

function pasteClipboard() {
    if (!clipboardData) return;
    pushUndo();
    const data = JSON.parse(JSON.stringify(clipboardData));
    data.position = [data.position[0] + 0.8, data.position[1], data.position[2] + 0.8];
    data.name = data.name + ' Copy';
    const obj = buildFromData(data);
    scene.add(obj);
    objects.push(obj);
    refreshObjectList();
    selectObject(obj);
    updateRealtimeCalc();
}

// --- EVENT LISTENERS ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

let pointerDownPos = null;
let marqueeStart = null;
let isDraggingMarquee = false;

function isUiTarget(e) {
    return e.target.closest('.window-panel') || e.target.closest('#taskbar') || e.target.tagName === 'INPUT';
}

window.addEventListener('mousedown', (e) => {
    if (isUiTarget(e) || transformControl.dragging) return;
    pointerDownPos = { x: e.clientX, y: e.clientY };

    if (e.shiftKey) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(selectableObjects(), true);
        if (intersects.length === 0) {
            marqueeStart = { x: e.clientX, y: e.clientY };
            isDraggingMarquee = false;
            orbit.enabled = false;
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (!marqueeStart) return;
    const dx = Math.abs(e.clientX - marqueeStart.x);
    const dy = Math.abs(e.clientY - marqueeStart.y);
    if (dx > 4 || dy > 4) isDraggingMarquee = true;
    if (isDraggingMarquee) {
        const x1 = Math.min(marqueeStart.x, e.clientX);
        const y1 = Math.min(marqueeStart.y, e.clientY);
        marqueeEl.style.left = x1 + 'px';
        marqueeEl.style.top = y1 + 'px';
        marqueeEl.style.width = Math.abs(e.clientX - marqueeStart.x) + 'px';
        marqueeEl.style.height = Math.abs(e.clientY - marqueeStart.y) + 'px';
        marqueeEl.style.display = 'block';
    }
});

window.addEventListener('mouseup', (e) => {
    if (marqueeStart) {
        orbit.enabled = true;
        if (isDraggingMarquee) {
            const x1 = Math.min(marqueeStart.x, e.clientX), x2 = Math.max(marqueeStart.x, e.clientX);
            const y1 = Math.min(marqueeStart.y, e.clientY), y2 = Math.max(marqueeStart.y, e.clientY);
            const picked = [];
            selectableObjects().forEach(obj => {
                const box = new THREE.Box3().setFromObject(obj);
                const center = new THREE.Vector3();
                box.getCenter(center);
                const proj = center.clone().project(camera);
                const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
                const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
                if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) picked.push(obj);
            });
            marqueeEl.style.display = 'none';
            if (picked.length >= 2) createGroupFromObjects(picked);
            else if (picked.length === 1) selectObject(picked[0]);
        }
        marqueeStart = null;
        isDraggingMarquee = false;
        pointerDownPos = null;
        return;
    }

    if (!pointerDownPos) return;
    const dx = Math.abs(e.clientX - pointerDownPos.x);
    const dy = Math.abs(e.clientY - pointerDownPos.y);
    pointerDownPos = null;
    if (dx > 4 || dy > 4) return;
    if (isUiTarget(e) || transformControl.dragging) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(selectableObjects(), true);
    if (intersects.length > 0) {
        selectObject(getTopLevelObject(intersects[0].object));
    } else {
        selectObject(null);
    }
});

window.addEventListener('dblclick', (e) => {
    if (isUiTarget(e)) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(selectableObjects(), true);
    if (intersects.length > 0) {
        const top = getTopLevelObject(intersects[0].object);
        if (top.isGroup) {
            selectObject(top);
            ungroupSelected();
        }
    }
});

window.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
        if (key === 'z') { e.preventDefault(); undo(); return; }
        if (key === 'y') { e.preventDefault(); redo(); return; }
        if (key === 'c') { e.preventDefault(); copySelected(); return; }
        if (key === 'v') { e.preventDefault(); pasteClipboard(); return; }
    }

    if (e.key === 'Delete' && selectedObject) {
        deleteObjectNode(selectedObject);
    }
    if (e.key.toLowerCase() === 't') setTool('translate');
    if (e.key.toLowerCase() === 'r') setTool('scale');
    if (e.key.toLowerCase() === 'e') setTool('rotate');
    if (e.key.toLowerCase() === 'q') setTool('select');
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

// --- DYNAMIC UI: MATERIALS, PRICES, PROJECT I/O ---
function populateMaterialSelect(sel) {
    if (!sel) return;
    sel.innerHTML = '';
    Object.keys(MATERIALS).forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = MATERIALS[id].label;
        sel.appendChild(opt);
    });
}
populateMaterialSelect(document.getElementById('sel-material'));
populateMaterialSelect(document.getElementById('sel-material-prop'));

function renderPriceInputs() {
    const box = document.getElementById('price-inputs');
    if (!box) return;
    box.innerHTML = '';
    PRICE_META.forEach(p => {
        const h = document.createElement('h4');
        h.textContent = p.label;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.id = 'inp-price-' + p.key;
        inp.min = '0';
        inp.value = priceDB[p.key];
        box.appendChild(h);
        box.appendChild(inp);
    });
}
renderPriceInputs();

// วัสดุตัวแทนของวัตถุ (สำหรับกลุ่มใช้วัสดุของลูกชิ้นแรกที่พบ)
function representativeMaterial(obj) {
    if (!obj) return DEFAULT_MATERIAL;
    if (obj.isMesh) return getMaterialId(obj);
    let found = DEFAULT_MATERIAL;
    obj.traverse(o => {
        if (o.isMesh && o.userData.material && MATERIALS[o.userData.material]) found = o.userData.material;
    });
    return found;
}

function syncMaterialDropdown(obj) {
    const sel = document.getElementById('sel-material-prop');
    if (sel && obj) sel.value = representativeMaterial(obj);
}

document.getElementById('sel-material-prop')?.addEventListener('change', (e) => {
    if (!selectedObject) return;
    pushUndo();
    applyMaterialTo(selectedObject, e.target.value);
    updateSelectionOutline(selectedObject);
    refreshObjectList();
    updateRealtimeCalc();
});

document.getElementById('btn-duplicate')?.addEventListener('click', () => {
    if (!selectedObject) { alert('กรุณาเลือกชิ้นงานก่อน'); return; }
    copySelected();
    pasteClipboard();
});

document.getElementById('btn-new-group')?.addEventListener('click', () => {
    createEmptyGroup();
});

document.getElementById('btn-group-selected')?.addEventListener('click', () => {
    const list = Array.from(multiSelected);
    if (list.length < 2) {
        alert('กรุณาติ๊ก ☑ เลือกชิ้นงานอย่างน้อย 2 ชิ้นในลิสต์ก่อน แล้วค่อยกด "รวมกลุ่มที่ติ๊ก"\n(หรือจะ Shift+ลากครอบในพื้นที่ 3 มิติก็ได้เช่นกัน)');
        return;
    }
    createGroupFromObjects(list);
    multiSelected.clear();
});

document.getElementById('btn-ungroup-selected')?.addEventListener('click', () => {
    if (!selectedObject || !selectedObject.isGroup) {
        alert('กรุณาคลิกเลือกกลุ่ม (📁) ที่ต้องการแยกในลิสต์ก่อน');
        return;
    }
    ungroupSelected();
});

document.getElementById('btn-reset-view')?.addEventListener('click', () => {
    camera.position.set(10, 8, 12);
    orbit.target.set(0, 0, 0);
    orbit.update();
});

// --- SAVE / LOAD PROJECT (.json) ---
document.getElementById('btn-save-project')?.addEventListener('click', () => {
    const data = {
        version: 1,
        savedAt: new Date().toISOString(),
        prices: priceDB,
        objects: objects.map(o => serializeObject(o))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'boq-project.json';
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('btn-load-project')?.addEventListener('click', () => {
    document.getElementById('file-load-project')?.click();
});

document.getElementById('file-load-project')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const list = Array.isArray(data) ? data : data.objects;
            if (!Array.isArray(list)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
            pushUndo();
            objects.forEach(o => { scene.remove(o); disposeObject(o); });
            objects = [];
            if (data.prices) {
                PRICE_META.forEach(p => {
                    if (typeof data.prices[p.key] === 'number') priceDB[p.key] = data.prices[p.key];
                });
                renderPriceInputs();
            }
            list.forEach(d => {
                const obj = buildFromData(d);
                scene.add(obj);
                objects.push(obj);
            });
            selectObject(null);
            refreshObjectList();
            updateRealtimeCalc();
        } catch (err) {
            alert('เปิดไฟล์ไม่สำเร็จ: ' + err.message);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
});

// --- ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);
    if (outlineHelper) outlineHelper.update();
    orbit.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}
animate();
// --- VIEWPORT TOOLBAR + SNAP + QUICKSTART ---
let currentTool = 'translate';
let snapOn = false;

function applyCurrentTool() {
    if (!selectedObject) { transformControl.visible = false; return; }
    if (currentTool === 'select') {
        transformControl.enabled = false;
        transformControl.visible = false;
    } else {
        transformControl.enabled = true;
        transformControl.visible = true;
        transformControl.setMode(currentTool);   // 'translate' | 'rotate' | 'scale'
    }
}

function setTool(tool) {
    currentTool = tool;
    applyCurrentTool();
    document.querySelectorAll('.vp-tool[data-tool]').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === tool));
}

function toggleSnap() {
    snapOn = !snapOn;
    transformControl.setTranslationSnap(snapOn ? 0.1 : null);              // ทีละ 10 ซม.
    transformControl.setRotationSnap(snapOn ? THREE.MathUtils.degToRad(15) : null); // ทีละ 15°
    if (transformControl.setScaleSnap) transformControl.setScaleSnap(snapOn ? 0.1 : null);
    document.getElementById('vp-snap')?.classList.toggle('active', snapOn);
}

document.querySelectorAll('#viewport-toolbar .vp-tool[data-tool]').forEach(btn =>
    btn.addEventListener('click', () => setTool(btn.dataset.tool)));
document.getElementById('vp-snap')?.addEventListener('click', toggleSnap);

(function initQuickstart() {
    const qs = document.getElementById('quickstart');
    if (!qs) return;
    let hidden = false;
    try { hidden = localStorage.getItem('boq_hide_quickstart') === '1'; } catch (e) {}
    if (hidden) { qs.style.display = 'none'; return; }
    document.getElementById('qs-close')?.addEventListener('click', () => {
        const chk = document.getElementById('qs-dontshow-chk');
        if (chk && chk.checked) { try { localStorage.setItem('boq_hide_quickstart', '1'); } catch (e) {} }
        qs.style.display = 'none';
    });
})();
