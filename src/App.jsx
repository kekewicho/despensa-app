import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { 
  collection, 
  onSnapshot, 
  writeBatch, 
  doc, 
  getDocs, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  arrayUnion,
  getDoc 
} from 'firebase/firestore';
import Papa from 'papaparse';
import { 
  Upload, 
  CheckCircle2, 
  Circle, 
  ShoppingCart, 
  Utensils, 
  ChefHat, 
  List, 
  Plus, 
  Trash2, 
  X,
  ClipboardPaste,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  FileCode
} from 'lucide-react';

const GEMINI_PROMPT_TEMPLATE = `Formatea la lista de despensa e ingredientes/menú estrictamente como JSON válido sin ningún texto explicativo ni marcas de código markdown, usando esta estructura:

{
  "despensa": [
    { "articulo": "Nombre del articulo", "cantidad": 1, "unidad": "pz", "origen": "Walmart" }
  ],
  "menu": [
    {
      "nombre": "Nombre del Platillo",
      "ingredientes": [
        { "nombre": "Ingrediente 1", "cantidad": "1", "unidad": "kg" }
      ]
    }
  ]
}

Por favor convierte las siguientes notas/compras:
`;

function App() {
  // --- ESTADOS PRINCIPALES ---
  const [activeTab, setActiveTab] = useState('despensa'); // 'despensa' | 'menu'
  const [pantryItems, setPantryItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [filterOrigen, setFilterOrigen] = useState('Todos');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // --- ESTADOS DE MODALES Y FORMULARIOS ---
  const [showPantryModal, setShowPantryModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  
  // Modal de Clipboard / JSON Parser
  const [showClipboardModal, setShowClipboardModal] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [importMode, setImportMode] = useState('append'); // 'append' | 'replace'
  const [importTarget, setImportTarget] = useState('auto'); // 'auto' | 'despensa' | 'menu'
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [parseStatus, setParseStatus] = useState({ valid: false, error: '', despensaCount: 0, menuCount: 0, parsedData: null });

  // Formulario Despensa
  const [newPantryItem, setNewPantryItem] = useState({ articulo: '', cantidad: 1, unidad: 'pz', origen: 'Walmart' });
  
  // Formulario Menú (Platillo Nuevo)
  const [newDishName, setNewDishName] = useState('');
  
  // Formulario Ingrediente (Agregar a platillo existente)
  const [selectedDishId, setSelectedDishId] = useState(null);
  const [newIngredient, setNewIngredient] = useState({ nombre: '', cantidad: '', unidad: '' });

  // --- 1. FIREBASE: LECTURA EN TIEMPO REAL ---
  useEffect(() => {
    const unsubPantry = onSnapshot(collection(db, "despensa"), (snap) => {
      setPantryItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubMenu = onSnapshot(collection(db, "menus"), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubPantry(); unsubMenu(); };
  }, []);

  // --- 2. ANALIZADOR / PARSER DE JSON EN TIEMPO REAL ---
  useEffect(() => {
    if (!jsonInput.trim()) {
      setParseStatus({ valid: false, error: '', despensaCount: 0, menuCount: 0, parsedData: null });
      return;
    }

    try {
      let rawText = jsonInput.trim();
      // Eliminar delimitadores de bloques de código markdown si los hay
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      const data = JSON.parse(rawText);
      let detectedDespensa = [];
      let detectedMenu = [];

      if (Array.isArray(data)) {
        // Es un arreglo directo
        data.forEach(item => {
          if (item && typeof item === 'object') {
            if ('articulo' in item) {
              detectedDespensa.push(item);
            } else if ('nombre' in item || 'platillo' in item || 'ingredientes' in item) {
              detectedMenu.push({
                nombre: item.nombre || item.platillo || 'Sin Nombre',
                ingredientes: Array.isArray(item.ingredientes) ? item.ingredientes : []
              });
            }
          }
        });
      } else if (data && typeof data === 'object') {
        // Es un objeto estructurado
        if (Array.isArray(data.despensa)) {
          detectedDespensa = data.despensa;
        } else if (data.articulo) {
          detectedDespensa = [data];
        }

        if (Array.isArray(data.menu)) {
          detectedMenu = data.menu;
        } else if (Array.isArray(data.menus)) {
          detectedMenu = data.menus;
        } else if (Array.isArray(data.comidas)) {
          detectedMenu = data.comidas;
        } else if (data.nombre || data.platillo) {
          detectedMenu = [{
            nombre: data.nombre || data.platillo || 'Sin Nombre',
            ingredientes: Array.isArray(data.ingredientes) ? data.ingredientes : []
          }];
        }
      }

      const despensaCount = detectedDespensa.length;
      const menuCount = detectedMenu.length;
      const isValid = despensaCount > 0 || menuCount > 0;

      setParseStatus({
        valid: isValid,
        error: isValid ? '' : 'No se detectaron elementos válidos para Despensa ni Menú.',
        despensaCount,
        menuCount,
        parsedData: { despensa: detectedDespensa, menu: detectedMenu }
      });
    } catch (err) {
      setParseStatus({
        valid: false,
        error: 'JSON inválido: ' + err.message,
        despensaCount: 0,
        menuCount: 0,
        parsedData: null
      });
    }
  }, [jsonInput]);

  // --- 3. ACCIONES DE DESPENSA ---
  const handleAddPantryItem = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, "despensa"), {
        ...newPantryItem,
        comprado: false,
        createdAt: new Date()
      });
      setShowPantryModal(false);
      setNewPantryItem({ articulo: '', cantidad: 1, unidad: 'pz', origen: 'Walmart' });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePantryItem = async (e, id) => {
    e.stopPropagation();
    if (confirm('¿Borrar este artículo?')) {
      await deleteDoc(doc(db, "despensa", id));
    }
  };

  const togglePantryItem = async (id, statusActual) => {
    await updateDoc(doc(db, "despensa", id), { comprado: !statusActual });
  };

  // --- 4. ACCIONES DE MENÚ ---
  const handleAddDish = async (e) => {
    e.preventDefault();
    if (!newDishName.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "menus"), {
        nombre: newDishName,
        preparado: false,
        ingredientes: []
      });
      setShowMenuModal(false);
      setNewDishName('');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDish = async (e, id) => {
    e.stopPropagation();
    if (confirm('¿Borrar este platillo y sus ingredientes?')) {
      await deleteDoc(doc(db, "menus", id));
    }
  };

  const openIngredientModal = (e, dishId) => {
    e.stopPropagation();
    setSelectedDishId(dishId);
    setShowIngredientModal(true);
  };

  const handleAddIngredientToDish = async (e) => {
    e.preventDefault();
    if (!newIngredient.nombre) return;
    
    setLoading(true);
    try {
      const dishRef = doc(db, "menus", selectedDishId);
      await updateDoc(dishRef, {
        ingredientes: arrayUnion(newIngredient)
      });
      setShowIngredientModal(false);
      setNewIngredient({ nombre: '', cantidad: '', unidad: '' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIngredient = async (dishId, ingredientIndex) => {
    const dishRef = doc(db, "menus", dishId);
    const dishDoc = await getDoc(dishRef);
    if (dishDoc.exists()) {
      const currentIngredients = dishDoc.data().ingredientes || [];
      const updatedIngredients = currentIngredients.filter((_, index) => index !== ingredientIndex);
      await updateDoc(dishRef, { ingredientes: updatedIngredients });
    }
  };

  const toggleMenuItem = async (id, statusActual) => {
    await updateDoc(doc(db, "menus", id), { preparado: !statusActual });
  };

  // --- 5. CARGA MASIVA DESDE CLIPBOARD (JSON) ---
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setJsonInput(text);
      }
    } catch (err) {
      alert("No se pudo acceder al portapapeles directamente. Pega el texto manualmente en el recuadro.");
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(GEMINI_PROMPT_TEMPLATE);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleProcessClipboardImport = async () => {
    if (!parseStatus.valid || !parseStatus.parsedData) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      const { despensa, menu } = parseStatus.parsedData;

      const shouldImportDespensa = (importTarget === 'auto' || importTarget === 'despensa') && despensa.length > 0;
      const shouldImportMenu = (importTarget === 'auto' || importTarget === 'menu') && menu.length > 0;

      if (!shouldImportDespensa && !shouldImportMenu) {
        alert("No hay elementos seleccionados para importar con la configuración actual.");
        setLoading(false);
        return;
      }

      // Modo Reemplazar: eliminar documentos existentes antes de agregar
      if (importMode === 'replace') {
        if (shouldImportDespensa || importTarget === 'despensa') {
          const pantrySnap = await getDocs(collection(db, "despensa"));
          pantrySnap.docs.forEach(d => batch.delete(d.ref));
        }
        if (shouldImportMenu || importTarget === 'menu') {
          const menuSnap = await getDocs(collection(db, "menus"));
          menuSnap.docs.forEach(d => batch.delete(d.ref));
        }
      }

      // Cargar Despensa
      if (shouldImportDespensa) {
        const pantryRef = collection(db, "despensa");
        despensa.forEach(item => {
          batch.set(doc(pantryRef), {
            articulo: String(item.articulo || item.nombre || 'Artículo'),
            cantidad: item.cantidad ?? 1,
            unidad: String(item.unidad || 'pz'),
            origen: String(item.origen || 'Walmart'),
            comprado: Boolean(item.comprado || false),
            createdAt: new Date()
          });
        });
      }

      // Cargar Menú
      if (shouldImportMenu) {
        const menuRef = collection(db, "menus");
        menu.forEach(dish => {
          const ingredientsCleaned = Array.isArray(dish.ingredientes)
            ? dish.ingredientes.map(ing => ({
                nombre: String(ing.nombre || ing.articulo || ''),
                cantidad: ing.cantidad !== undefined ? String(ing.cantidad) : '',
                unidad: String(ing.unidad || '')
              }))
            : [];

          batch.set(doc(menuRef), {
            nombre: String(dish.nombre || dish.platillo || 'Platillo Nuevo'),
            preparado: Boolean(dish.preparado || false),
            ingredientes: ingredientsCleaned
          });
        });
      }

      await batch.commit();

      const details = [];
      if (shouldImportDespensa) details.push(`${despensa.length} en Despensa`);
      if (shouldImportMenu) details.push(`${menu.length} en Menú`);

      alert(`✅ Carga completada (${importMode === 'replace' ? 'Reemplazado' : 'Agregado'}):\n- ` + details.join('\n- '));

      setShowClipboardModal(false);
      setJsonInput('');
    } catch (err) {
      console.error("Error al importar JSON:", err);
      alert("Error al guardar en Firebase: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- 6. CARGA MASIVA (CSV) ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          if (activeTab === 'despensa') await replacePantryDB(results.data);
          else await replaceMenuDB(results.data);
        } catch (error) {
          alert("Error al subir CSV");
        } finally {
          setLoading(false);
          event.target.value = null;
        }
      }
    });
  };

  const replacePantryDB = async (newItems) => {
    const batch = writeBatch(db);
    const ref = collection(db, "despensa");
    (await getDocs(ref)).docs.forEach(d => batch.delete(d.ref));
    newItems.forEach(i => {
      if(i.articulo && i.origen) batch.set(doc(ref), { 
        articulo: i.articulo, cantidad: i.cantidad || 1, unidad: i.unidad || 'pz', origen: i.origen, comprado: false 
      });
    });
    await batch.commit();
    alert("Lista actualizada");
  };

  const replaceMenuDB = async (rawRows) => {
    const batch = writeBatch(db);
    const ref = collection(db, "menus");
    (await getDocs(ref)).docs.forEach(d => batch.delete(d.ref));
    const grouped = {};
    rawRows.forEach(row => {
      if (!row.platillo) return;
      const name = row.platillo.trim();
      if (!grouped[name]) grouped[name] = { nombre: name, preparado: false, ingredientes: [] };
      if (row.ingrediente) grouped[name].ingredientes.push({ nombre: row.ingrediente, cantidad: row.cantidad || '', unidad: row.unidad || '' });
    });
    Object.values(grouped).forEach(d => batch.set(doc(ref), d));
    await batch.commit();
    alert("Menú actualizado");
  };

  // --- RENDERIZADORES ---

  const renderDespensa = () => {
    const origenesUnicos = ['Todos', ...new Set(pantryItems.map(i => i.origen))];
    const itemsFiltrados = filterOrigen === 'Todos' ? pantryItems : pantryItems.filter(i => i.origen === filterOrigen);
    const itemsPorOrigen = itemsFiltrados.reduce((acc, item) => {
      (acc[item.origen] = acc[item.origen] || []).push(item);
      return acc;
    }, {});

    return (
      <div className="pb-24">
        {/* Filtros */}
        <div className="sticky top-[72px] z-10 bg-gray-50 py-2 px-4 overflow-x-auto whitespace-nowrap scrollbar-hide border-b border-gray-200">
          <div className="flex gap-2">
            {origenesUnicos.map(origen => (
              <button key={origen} onClick={() => setFilterOrigen(origen)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filterOrigen === origen ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}>
                {origen}
              </button>
            ))}
          </div>
        </div>
        {/* Lista */}
        <div className="p-4 max-w-md mx-auto">
          {Object.keys(itemsPorOrigen).length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart size={48} className="mx-auto mb-2 opacity-50" />
              <p className="font-medium text-gray-500">No hay artículos en la despensa</p>
              <p className="text-xs text-gray-400 mt-1">Usa la importación por IA o agrega manualmente con el botón +</p>
            </div>
          ) : (
            Object.keys(itemsPorOrigen).map(origen => (
              <div key={origen} className="mb-6">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">{origen}</h2>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {itemsPorOrigen[origen].map((item) => (
                    <div key={item.id} onClick={() => togglePantryItem(item.id, item.comprado)}
                      className={`flex items-center justify-between p-4 border-b border-gray-50 last:border-0 active:bg-gray-50 cursor-pointer ${item.comprado ? 'bg-gray-50' : ''}`}>
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={item.comprado ? "text-green-500 shrink-0" : "text-gray-300 shrink-0"}>
                          {item.comprado ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                        </div>
                        <div className="truncate">
                          <p className={`font-medium text-base truncate ${item.comprado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.articulo}</p>
                          <p className="text-xs text-gray-500">{item.cantidad} {item.unidad}</p>
                        </div>
                      </div>
                      <button onClick={(e) => handleDeletePantryItem(e, item.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderMenu = () => {
    return (
      <div className="p-4 max-w-md mx-auto pb-24">
        {menuItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ChefHat size={48} className="mx-auto mb-2 opacity-50" />
            <p className="font-medium text-gray-500">No hay platillos en el menú</p>
            <p className="text-xs text-gray-400 mt-1">Usa la importación por IA o crea un platillo nuevo</p>
          </div>
        ) : (
          <div className="space-y-4">
            {menuItems.map(dish => (
              <div key={dish.id} className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${dish.preparado ? 'opacity-60' : ''}`}>
                <div onClick={() => toggleMenuItem(dish.id, dish.preparado)} className="p-4 bg-orange-50 border-b border-orange-100 flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-orange-100 p-2 rounded-full text-orange-600 shrink-0"><ChefHat size={20} /></div>
                    <h3 className={`font-bold text-lg truncate ${dish.preparado ? 'line-through text-gray-500' : 'text-gray-800'}`}>{dish.nombre}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={dish.preparado ? "text-green-600" : "text-gray-300"}>
                      {dish.preparado ? <CheckCircle2 size={28} /> : <Circle size={28} />}
                    </div>
                    <button onClick={(e) => handleDeleteDish(e, dish.id)} className="p-2 text-orange-300 hover:text-red-500 z-10">
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-white relative">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-gray-400 uppercase">Ingredientes:</p>
                    <button onClick={(e) => openIngredientModal(e, dish.id)} className="text-orange-600 bg-orange-50 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                      <Plus size={12} /> Agregar
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {dish.ingredientes && dish.ingredientes.map((ing, idx) => (
                      <li key={idx} className="flex items-center justify-between text-sm text-gray-600 border-b border-gray-50 last:border-0 pb-1 last:pb-0">
                        <span>• {ing.nombre}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs">{ing.cantidad} {ing.unidad}</span>
                          <button onClick={() => handleDeleteIngredient(dish.id, idx)} className="text-gray-300 hover:text-red-400"><X size={14} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg text-white transition-colors ${activeTab === 'despensa' ? 'bg-blue-600' : 'bg-orange-500'}`}>
            {activeTab === 'despensa' ? <ShoppingCart size={20} /> : <Utensils size={20} />}
          </div>
          <h1 className="text-xl font-bold text-gray-800">{activeTab === 'despensa' ? "Yoyo's Despensa" : "Menú Quincenal"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowClipboardModal(true)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-sm active:scale-95 transition-all"
            title="Importar JSON desde Portapapeles (IA)"
          >
            <Sparkles size={16} />
            <span>Cargar JSON</span>
          </button>
          <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current.click()} disabled={loading} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium active:scale-95 transition-transform" title="Subir CSV">
            {loading ? '...' : <Upload size={16} />}
          </button>
        </div>
      </header>

      <main>{activeTab === 'despensa' ? renderDespensa() : renderMenu()}</main>

      {/* FAB (Floating Action Button) */}
      <button 
        onClick={() => activeTab === 'despensa' ? setShowPantryModal(true) : setShowMenuModal(true)}
        className={`fixed bottom-20 right-4 p-4 rounded-full shadow-lg text-white transition-transform active:scale-90 z-40 ${activeTab === 'despensa' ? 'bg-blue-600' : 'bg-orange-500'}`}
      >
        <Plus size={32} />
      </button>

      {/* Nav Inferior */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-30 flex justify-around items-center h-16 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveTab('despensa')} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'despensa' ? 'text-blue-600' : 'text-gray-400'}`}>
          <List size={24} /> <span className="text-xs font-medium mt-1">Despensa</span>
        </button>
        <div className="w-px h-8 bg-gray-200"></div>
        <button onClick={() => setActiveTab('menu')} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'menu' ? 'text-orange-500' : 'text-gray-400'}`}>
          <Utensils size={24} /> <span className="text-xs font-medium mt-1">Menú</span>
        </button>
      </nav>

      {/* MODAL IMPORTACIÓN DE CLIPBOARD / JSON (IA) */}
      {showClipboardModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-600">
                <Sparkles size={22} />
                <h3 className="text-lg font-bold text-gray-800">Cargar JSON (Portapapeles / Gemini)</h3>
              </div>
              <button onClick={() => setShowClipboardModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>

            {/* Helper Gemini Prompt */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4 flex items-center justify-between">
              <div className="text-xs text-indigo-900 pr-2">
                <span className="font-bold block text-indigo-950 mb-0.5">¿Usando Gemini o ChatGPT?</span>
                Copia nuestra plantilla de prompt para pedirle a la IA el formato perfecto.
              </div>
              <button 
                onClick={handleCopyPrompt} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-2 rounded-lg shrink-0 flex items-center gap-1 font-semibold transition-colors shadow-sm"
              >
                {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedPrompt ? '¡Copiado!' : 'Copiar Prompt'}</span>
              </button>
            </div>

            {/* Area de Texto JSON */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-gray-600 uppercase">Pega el JSON aquí:</label>
                <button 
                  type="button" 
                  onClick={handlePasteFromClipboard} 
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                >
                  <ClipboardPaste size={14} /> Pegar del Portapapeles
                </button>
              </div>
              <textarea
                rows={6}
                value={jsonInput}
                onChange={e => setJsonInput(e.target.value)}
                placeholder='{\n  "despensa": [{ "articulo": "Manzanas", "cantidad": 6, "origen": "Costco" }],\n  "menu": [{ "nombre": "Ensalada", "ingredientes": [...] }]\n}'
                className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 font-mono text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            {/* Estado de Validación */}
            {jsonInput.trim() !== '' && (
              <div className="mb-4">
                {parseStatus.valid ? (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                      <span>Estructura JSON válida detectada</span>
                    </div>
                    <div className="flex gap-2 font-bold text-xs">
                      {parseStatus.despensaCount > 0 && <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">Despensa: {parseStatus.despensaCount}</span>}
                      {parseStatus.menuCount > 0 && <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">Menú: {parseStatus.menuCount}</span>}
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs flex items-start gap-2">
                    <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <span>{parseStatus.error}</span>
                  </div>
                )}
              </div>
            )}

            {/* Opciones de Carga */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {/* Modo: Agregar vs Reemplazar */}
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase block mb-1.5">Modo de Carga</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-gray-700">
                    <input 
                      type="radio" 
                      name="importMode" 
                      value="append" 
                      checked={importMode === 'append'} 
                      onChange={() => setImportMode('append')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Anexar / Agregar a lo existente</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-red-600">
                    <input 
                      type="radio" 
                      name="importMode" 
                      value="replace" 
                      checked={importMode === 'replace'} 
                      onChange={() => setImportMode('replace')}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span>Reemplazar lista actual</span>
                  </label>
                </div>
              </div>

              {/* Destino */}
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase block mb-1.5">Destino</label>
                <select 
                  value={importTarget} 
                  onChange={e => setImportTarget(e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="auto">Automático / Homologado</option>
                  <option value="despensa">Sólo Despensa</option>
                  <option value="menu">Sólo Menú</option>
                </select>
              </div>
            </div>

            {/* Botones de Acción */}
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setShowClipboardModal(false)} 
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleProcessClipboardImport} 
                disabled={!parseStatus.valid || loading}
                className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Guardando...' : 'Importar Datos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DESPENSA */}
      {showPantryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Agregar a Despensa</h3>
            <form onSubmit={handleAddPantryItem} className="space-y-3">
              <input autoFocus placeholder="Artículo (ej. Leche)" value={newPantryItem.articulo} onChange={e => setNewPantryItem({...newPantryItem, articulo: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 outline-blue-500 text-sm" required />
              <div className="flex gap-2">
                <input type="number" placeholder="Cant." value={newPantryItem.cantidad} onChange={e => setNewPantryItem({...newPantryItem, cantidad: e.target.value})} className="w-1/3 border p-3 rounded-lg bg-gray-50 outline-blue-500 text-sm" />
                <input placeholder="Unidad" value={newPantryItem.unidad} onChange={e => setNewPantryItem({...newPantryItem, unidad: e.target.value})} className="w-2/3 border p-3 rounded-lg bg-gray-50 outline-blue-500 text-sm" />
              </div>
              <select value={newPantryItem.origen} onChange={e => setNewPantryItem({...newPantryItem, origen: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 outline-blue-500 text-sm">
                {['Walmart', 'Costco', 'Mercado', 'Carniceria', 'Abarrotes', 'Oxxo'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPantryModal(false)} className="flex-1 py-3 text-gray-500 font-medium text-sm">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVO PLATILLO */}
      {showMenuModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Nuevo Platillo</h3>
            <form onSubmit={handleAddDish} className="space-y-4">
              <input autoFocus placeholder="Nombre del platillo" value={newDishName} onChange={e => setNewDishName(e.target.value)} className="w-full border p-3 rounded-lg bg-gray-50 outline-orange-500 text-sm" required />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowMenuModal(false)} className="flex-1 py-3 text-gray-500 font-medium text-sm">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold text-sm">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVO INGREDIENTE */}
      {showIngredientModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Agregar Ingrediente</h3>
            <form onSubmit={handleAddIngredientToDish} className="space-y-3">
              <input autoFocus placeholder="Ingrediente (ej. Tomate)" value={newIngredient.nombre} onChange={e => setNewIngredient({...newIngredient, nombre: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 outline-orange-500 text-sm" required />
              <div className="flex gap-2">
                <input placeholder="Cantidad" value={newIngredient.cantidad} onChange={e => setNewIngredient({...newIngredient, cantidad: e.target.value})} className="w-1/2 border p-3 rounded-lg bg-gray-50 outline-orange-500 text-sm" />
                <input placeholder="Unidad" value={newIngredient.unidad} onChange={e => setNewIngredient({...newIngredient, unidad: e.target.value})} className="w-1/2 border p-3 rounded-lg bg-gray-50 outline-orange-500 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowIngredientModal(false)} className="flex-1 py-3 text-gray-500 font-medium text-sm">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold text-sm">Agregar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;