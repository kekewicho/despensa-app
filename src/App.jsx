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
  X 
} from 'lucide-react';

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

  // --- 2. ACCIONES DE DESPENSA (Add/Delete/Toggle) ---

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
      setNewPantryItem({ articulo: '', cantidad: 1, unidad: 'pz', origen: 'Walmart' }); // Reset
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePantryItem = async (e, id) => {
    e.stopPropagation(); // Evitar activar el toggle de comprado
    if (confirm('¿Borrar este artículo?')) {
      await deleteDoc(doc(db, "despensa", id));
    }
  };

  const togglePantryItem = async (id, statusActual) => {
    await updateDoc(doc(db, "despensa", id), { comprado: !statusActual });
  };

  // --- 3. ACCIONES DE MENÚ (Add Dish/Delete Dish/Add Ing/Del Ing) ---

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
    // Para borrar de un array en Firestore necesitamos leer, filtrar y reescribir
    // o usar arrayRemove si tenemos el objeto exacto. Filtrar es más seguro por índice.
    const dishRef = doc(db, "menus", dishId);
    const dishDoc = await getDoc(dishRef);
    if (dishDoc.exists()) {
      const currentIngredients = dishDoc.data().ingredientes || [];
      const updatedIngredients = currentIngredients.filter((_, index) => index !== ingredientIndex);
      await updateDoc(dishRef, { ingredients: updatedIngredients }); // Firestore field match
      // Nota: Si tu campo se llama 'ingredientes' en español en la BD:
      await updateDoc(dishRef, { ingredientes: updatedIngredients });
    }
  };

  const toggleMenuItem = async (id, statusActual) => {
    await updateDoc(doc(db, "menus", id), { preparado: !statusActual });
  };

  // --- 4. CARGA MASIVA (CSV) - Mantenemos la lógica anterior ---
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
          {Object.keys(itemsPorOrigen).map(origen => (
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
          ))}
        </div>
      </div>
    );
  };

  const renderMenu = () => {
    return (
      <div className="p-4 max-w-md mx-auto pb-24">
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
        <div>
          <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current.click()} disabled={loading} className="flex items-center gap-2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm active:scale-95 transition-transform">
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

      {/* MODAL DESPENSA */}
      {showPantryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Agregar a Despensa</h3>
            <form onSubmit={handleAddPantryItem} className="space-y-3">
              <input autoFocus placeholder="Artículo (ej. Leche)" value={newPantryItem.articulo} onChange={e => setNewPantryItem({...newPantryItem, articulo: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 outline-blue-500" required />
              <div className="flex gap-2">
                <input type="number" placeholder="Cant." value={newPantryItem.cantidad} onChange={e => setNewPantryItem({...newPantryItem, cantidad: e.target.value})} className="w-1/3 border p-3 rounded-lg bg-gray-50 outline-blue-500" />
                <input placeholder="Unidad" value={newPantryItem.unidad} onChange={e => setNewPantryItem({...newPantryItem, unidad: e.target.value})} className="w-2/3 border p-3 rounded-lg bg-gray-50 outline-blue-500" />
              </div>
              <select value={newPantryItem.origen} onChange={e => setNewPantryItem({...newPantryItem, origen: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 outline-blue-500">
                {['Walmart', 'Costco', 'Mercado', 'Carniceria', 'Abarrotes', 'Oxxo'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPantryModal(false)} className="flex-1 py-3 text-gray-500 font-medium">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold">Guardar</button>
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
              <input autoFocus placeholder="Nombre del platillo" value={newDishName} onChange={e => setNewDishName(e.target.value)} className="w-full border p-3 rounded-lg bg-gray-50 outline-orange-500" required />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowMenuModal(false)} className="flex-1 py-3 text-gray-500 font-medium">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold">Crear</button>
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
              <input autoFocus placeholder="Ingrediente (ej. Tomate)" value={newIngredient.nombre} onChange={e => setNewIngredient({...newIngredient, nombre: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 outline-orange-500" required />
              <div className="flex gap-2">
                <input placeholder="Cantidad" value={newIngredient.cantidad} onChange={e => setNewIngredient({...newIngredient, cantidad: e.target.value})} className="w-1/2 border p-3 rounded-lg bg-gray-50 outline-orange-500" />
                <input placeholder="Unidad" value={newIngredient.unidad} onChange={e => setNewIngredient({...newIngredient, unidad: e.target.value})} className="w-1/2 border p-3 rounded-lg bg-gray-50 outline-orange-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowIngredientModal(false)} className="flex-1 py-3 text-gray-500 font-medium">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold">Agregar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;