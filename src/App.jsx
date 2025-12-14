import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { 
  collection, 
  onSnapshot, 
  writeBatch, 
  doc, 
  getDocs,
  updateDoc 
} from 'firebase/firestore';
import Papa from 'papaparse';
import { Upload, CheckCircle2, Circle, Filter, ShoppingCart, Trash2 } from 'lucide-react';

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterOrigen, setFilterOrigen] = useState('Todos');
  const fileInputRef = useRef(null);

  // 1. Escuchar cambios en tiempo real (Base de datos -> App)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "despensa"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
    });
    return () => unsubscribe();
  }, []);

  // 2. Lógica para subir y reemplazar CSV
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          await replaceDatabase(results.data);
        } catch (error) {
          console.error("Error al procesar:", error);
          alert("Hubo un error al subir la lista.");
        } finally {
          setLoading(false);
          event.target.value = null; // Reset input
        }
      }
    });
  };

  // Función crítica: Borra todo y sube lo nuevo
  const replaceDatabase = async (newItems) => {
    const batch = writeBatch(db);
    const collectionRef = collection(db, "despensa");

    // A. Obtener items actuales para borrarlos
    const snapshot = await getDocs(collectionRef);
    snapshot.docs.forEach((document) => {
      batch.delete(document.ref);
    });

    // B. Añadir nuevos items del CSV
    newItems.forEach((item) => {
      // Validar que tenga datos mínimos
      if(item.articulo && item.origen) {
        const newRef = doc(collectionRef);
        batch.set(newRef, {
          articulo: item.articulo,
          cantidad: item.cantidad || 1,
          unidad: item.unidad || 'pz',
          origen: item.origen,
          comprado: false, // Campo booleano adicional
          createdAt: new Date()
        });
      }
    });

    await batch.commit();
    setFilterOrigen('Todos'); // Resetear filtro
    alert("¡Lista de despensa actualizada!");
  };

  // 3. Toggle de "Comprado"
  const toggleComprado = async (id, statusActual) => {
    const itemRef = doc(db, "despensa", id);
    await updateDoc(itemRef, { comprado: !statusActual });
  };

  // 4. Lógica de Agrupación y Filtrado
  const origenesUnicos = ['Todos', ...new Set(items.map(i => i.origen))];
  
  const itemsFiltrados = filterOrigen === 'Todos' 
    ? items 
    : items.filter(i => i.origen === filterOrigen);

  // Agrupar items visibles por origen para la vista
  const itemsPorOrigen = itemsFiltrados.reduce((acc, item) => {
    if (!acc[item.origen]) acc[item.origen] = [];
    acc[item.origen].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      
      {/* Header Sticky */}
      <header className="sticky top-0 z-10 bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <ShoppingCart size={20} />
          </div>
          <h1 className="text-xl font-bold text-gray-800">Yoyo's despensa</h1>
        </div>
        
        <div>
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <button 
            onClick={() => fileInputRef.current.click()}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm active:scale-95 transition-transform"
          >
            {loading ? 'Cargando...' : <><Upload size={16} /> Subir CSV</>}
          </button>
        </div>
      </header>

      {/* Filtros Horizontales (Scrollable) */}
      <div className="sticky top-[72px] z-10 bg-gray-50 pt-2 pb-2 px-4 overflow-x-auto whitespace-nowrap scrollbar-hide border-b border-gray-200">
        <div className="flex gap-2">
          {origenesUnicos.map(origen => (
            <button
              key={origen}
              onClick={() => setFilterOrigen(origen)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterOrigen === origen 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {origen}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Contenido */}
      <main className="p-4 max-w-md mx-auto">
        {Object.keys(itemsPorOrigen).length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p>No hay items. Sube un CSV.</p>
          </div>
        )}

        {Object.keys(itemsPorOrigen).map(origen => (
          <div key={origen} className="mb-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
              {origen}
            </h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {itemsPorOrigen[origen].map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => toggleComprado(item.id, item.comprado)}
                  className={`flex items-center justify-between p-4 border-b border-gray-50 last:border-0 active:bg-gray-50 cursor-pointer transition-colors ${item.comprado ? 'bg-gray-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={item.comprado ? "text-green-500" : "text-gray-300"}>
                      {item.comprado ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                    </div>
                    <div>
                      <p className={`font-medium text-base ${item.comprado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {item.articulo}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.cantidad} {item.unidad}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>

      {/* Indicador de carga global */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-800">Actualizando base de datos...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;