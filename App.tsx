import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    GeneratedImage, GenerationParams, StylePreset, 
    GenerationTask, Resolution, AspectRatio 
} from './types';
import { ASPECT_RATIOS, DEFAULT_PRESETS } from './constants';
import { initDB, saveImage, getGallery, deleteImage, savePreset, getAllPresets, deletePreset } from './services/storage';
import { generateSingleImage } from './services/gemini';
import { ImageCard } from './components/ImageCard';
import { Modal } from './components/Modal';
import { 
    ImageIcon, Sparkles, Settings, History, 
    Plus, X, RefreshCw, Wand2, LayoutGrid,
    MoreVertical, Trash2, ChevronUp, ChevronDown, 
    SlidersHorizontal, Key, Github, Twitter
} from './components/Icons';

// Aspect Ratio Icon Helper
const AspectRatioIcon = ({ ratio, active, orientation }: { ratio: AspectRatio, active: boolean, orientation: 'portrait' | 'landscape' }) => {
    const [w, h] = ratio.split(':').map(Number);
    const maxDim = 24; // Fixed dimension size
    let width, height;

    if (orientation === 'portrait') {
        // Fixed Height, Variable Width
        height = maxDim;
        width = (w / h) * maxDim;
    } else {
        // Fixed Width, Variable Height
        width = maxDim;
        height = (h / w) * maxDim;
    }

    return (
        <div 
            className={`flex flex-col items-center justify-center gap-1.5 p-1 rounded-lg border transition-all cursor-pointer h-14 min-w-[3.5rem] ${
                active 
                ? 'bg-peach-500/20 border-peach-500 text-peach-100 shadow-[0_0_10px_rgba(255,127,80,0.2)]' 
                : 'bg-gray-800/50 border-gray-700/50 text-gray-500 hover:bg-gray-800 hover:border-gray-600'
            }`}
        >
            <div 
                className={`border-[1.5px] rounded-[1px] transition-all flex-shrink-0 ${active ? 'border-peach-400 bg-peach-400/20' : 'border-current'}`}
                style={{ width: `${width}px`, height: `${height}px` }}
            />
            <span className="text-[9px] font-mono leading-none opacity-80">{ratio}</span>
        </div>
    );
};

export default function App() {
  // --- Auth State ---
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [isKeyModalOpen, setKeyModalOpen] = useState(false);

  // --- App State ---
  const [activeTab, setActiveTab] = useState<'create' | 'gallery'>('create');
  
  // Params
  const [params, setParams] = useState<GenerationParams>({
    aspectRatios: ['16:9'],
    resolution: '2K',
    count: 4,
  });

  // Inputs
  const [prompt, setPrompt] = useState('A giga peach, hand-drawn crayon style, rough texture, thick black outlines, big round eyes, cute simple face, solid vivid blue background');
  const [selectedStyleId, setSelectedStyleId] = useState<string>('none');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  
  // UI State
  const [showConfig, setShowConfig] = useState(true);

  // Data
  const [allPresets, setAllPresets] = useState<StylePreset[]>([]);
  const [tasks, setTasks] = useState<GenerationTask[]>([]); // Current session tasks
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  
  // UI
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  
  // Style Modal State
  const [isStyleModalOpen, setStyleModalOpen] = useState(false);
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null); // null = create new
  const [styleFormName, setStyleFormName] = useState('');
  const [styleFormDesc, setStyleFormDesc] = useState('');
  const [styleFormIcon, setStyleFormIcon] = useState('');
  const [styleFormImages, setStyleFormImages] = useState<string[]>([]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleImageInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  // --- Initialization ---
  useEffect(() => {
    // Load Key
    const savedKey = localStorage.getItem('gp_api_key');
    const savedBaseUrl = localStorage.getItem('gp_base_url');
    if (savedKey) setApiKey(savedKey);
    if (savedBaseUrl) setBaseUrl(savedBaseUrl);

    initDB().then(async () => {
      // 1. Migrate/Update Default Preset
      const defaultPresetDef = DEFAULT_PRESETS.find(p => p.id === 'none');
      if (defaultPresetDef) {
          await savePreset(defaultPresetDef);
      }

      // 2. Merge missing defaults (Migration for existing users)
      let currentPresets = await getAllPresets();
      const existingIds = new Set(currentPresets.map(p => p.id));
      const missingDefaults = DEFAULT_PRESETS.filter(p => !existingIds.has(p.id));
      
      if (missingDefaults.length > 0) {
          console.log("Seeding missing default presets:", missingDefaults.map(p => p.name));
          for (const p of missingDefaults) {
              await savePreset(p);
          }
          // Reload after merge
          currentPresets = await getAllPresets();
      }
      
      setAllPresets(currentPresets);
      loadGallery();
      
      const savedParams = localStorage.getItem('gp_params');
      if (savedParams) {
          try {
              setParams(JSON.parse(savedParams));
          } catch(e) {}
      }
    });
  }, []);

  useEffect(() => {
      localStorage.setItem('gp_params', JSON.stringify(params));
  }, [params]);

  // Auto-scroll to bottom when tasks change
  useEffect(() => {
    if (activeTab === 'create' && tasks.length > 0) {
        scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tasks.length, activeTab]);

  const loadGallery = async () => {
    const images = await getGallery();
    setGallery(images);
  };

  const refreshPresets = async () => {
      const presets = await getAllPresets();
      setAllPresets(presets);
  };

  // --- Handlers ---

  const handleSaveKey = () => {
      const key = keyInputRef.current?.value.trim();
      const url = document.getElementById('base-url-input') as HTMLInputElement;
      
      if (key) {
          setApiKey(key);
          localStorage.setItem('gp_api_key', key);
          
          if (url?.value.trim()) {
              setBaseUrl(url.value.trim());
              localStorage.setItem('gp_base_url', url.value.trim());
          } else {
              setBaseUrl('');
              localStorage.removeItem('gp_base_url');
          }
          setKeyModalOpen(false);
      }
  };

  const handleClearKey = () => {
      setApiKey('');
      setBaseUrl('');
      localStorage.removeItem('gp_api_key');
      localStorage.removeItem('gp_base_url');
      setKeyModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isStyle = false) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file: File) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            if (isStyle) {
                setStyleFormImages(prev => {
                    if (prev.length >= 6) return prev;
                    return [...prev, result];
                });
            } else {
                setReferenceImages(prev => {
                    if (prev.length >= 6) return prev;
                    return [...prev, result];
                });
            }
          };
          reader.readAsDataURL(file);
      });
      e.target.value = '';
    }
  };

  const removeReferenceImage = (index: number) => {
      setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };
  
  const removeStyleImage = (index: number) => {
      setStyleFormImages(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (referenceImages.length < 6) {
                    setReferenceImages(prev => [...prev, result]);
                }
            };
            reader.readAsDataURL(file);
            e.preventDefault();
        }
      }
    }
  };

  const openCreateStyleModal = () => {
      setEditingStyleId(null);
      setStyleFormName('');
      setStyleFormDesc('');
      setStyleFormIcon('');
      setStyleFormImages(referenceImages.length > 0 ? [...referenceImages] : []);
      setStyleModalOpen(true);
  };

  const openEditStyleModal = (style: StylePreset) => {
      setEditingStyleId(style.id);
      setStyleFormName(style.name);
      setStyleFormDesc(style.description);
      setStyleFormIcon(style.icon || '');
      setStyleFormImages(style.referenceImages || []);
      setStyleModalOpen(true);
  };

  const handleSaveStyle = async () => {
      if (!styleFormName || !styleFormDesc) return;
      
      const id = editingStyleId || `custom-${Date.now()}`;

      const preset: StylePreset = {
          id,
          name: styleFormName,
          description: styleFormDesc,
          icon: styleFormIcon,
          referenceImages: styleFormImages.length > 0 ? styleFormImages : undefined
      };
      
      await savePreset(preset);
      await refreshPresets();
      
      setSelectedStyleId(id);
      setStyleModalOpen(false);
  };

  const handleDeleteStyle = async () => {
      if (!editingStyleId) return;
      await deletePreset(editingStyleId);
      await refreshPresets();
      
      if (selectedStyleId === editingStyleId) {
          setSelectedStyleId('none');
      }
      setStyleModalOpen(false);
  };

  const handleGenerate = async (retryPrompt?: string, retryRefImages?: string[]) => {
    // 1. Check API Key
    if (!apiKey) {
        setKeyModalOpen(true);
        return;
    }

    const effectivePrompt = retryPrompt ?? prompt;
    const effectiveRefImages = retryRefImages ?? referenceImages;

    if (!effectivePrompt.trim() && effectiveRefImages.length === 0) return;

    setActiveTab('create');
    setShowConfig(false);

    const style = allPresets.find(s => s.id === selectedStyleId);
    
    let finalPrompt = effectivePrompt;
    if (!retryPrompt && style && style.id !== 'none') {
         finalPrompt = `${style.description}. ${effectivePrompt}`;
    }

    const finalRefImages = [...(effectiveRefImages), ...(style?.referenceImages || [])];
    const batchId = Date.now().toString();
    const newTasks: GenerationTask[] = [];

    params.aspectRatios.forEach(ratio => {
        for (let i = 0; i < params.count; i++) {
            newTasks.push({
                id: `${batchId}-${ratio}-${i}`,
                batchId: batchId,
                status: 'pending',
                aspectRatio: ratio,
                prompt: finalPrompt,
                placeholder: true
            });
        }
    });

    setTasks(prev => [...prev, ...newTasks]);

    newTasks.forEach(task => {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'generating' } : t));

        generateSingleImage({
            prompt: finalPrompt,
            referenceImages: finalRefImages,
            aspectRatio: task.aspectRatio,
            resolution: params.resolution,
            apiKey: apiKey,
            baseUrl: baseUrl || undefined
        })
        .then(async (url) => {
            const generatedData: GeneratedImage = {
                id: task.id,
                batchId: batchId,
                url,
                prompt: finalPrompt,
                aspectRatio: task.aspectRatio,
                resolution: params.resolution,
                timestamp: Date.now(),
                styleId: selectedStyleId,
                referenceImages: finalRefImages
            };

            await saveImage(generatedData);
            
            setTasks(prev => prev.map(t => t.id === task.id ? { 
                ...t, 
                status: 'success', 
                data: generatedData 
            } : t));

            loadGallery();
        })
        .catch(err => {
            setTasks(prev => prev.map(t => t.id === task.id ? { 
                ...t, 
                status: 'error', 
                error: err.message || "Generation failed"
            } : t));
        });
    });
    
    if(!retryPrompt) {
        setPrompt('');
        setReferenceImages([]);
    }
  };

  const handleIterate = (image: GeneratedImage) => {
      setReferenceImages([image.url]);
      setPrompt(image.prompt);
      setActiveTab('create');
      setTimeout(() => promptInputRef.current?.focus(), 100);
  };

  const handleDeleteTask = (id: string) => {
      setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleDeleteGallery = async (id: string) => {
      await deleteImage(id);
      loadGallery();
  };
  
  const handleRegenerateBatch = (batchTasks: GenerationTask[]) => {
      if (batchTasks.length === 0) return;
      const firstPrompt = batchTasks[0].prompt;
      const firstData = batchTasks.find(t => t.data)?.data;
      if (firstData) {
        handleGenerate(firstData.prompt, firstData.referenceImages);
      } else {
        handleGenerate(firstPrompt);
      }
  };

  const groupTasksByBatch = (tasks: GenerationTask[]) => {
      const groups: { [key: string]: GenerationTask[] } = {};
      const order: string[] = [];

      tasks.forEach(task => {
          const bid = task.batchId || 'legacy';
          if (!groups[bid]) {
              groups[bid] = [];
              order.push(bid);
          }
          groups[bid].push(task);
      });

      return order.map(bid => groups[bid]);
  };
  
  const groupTasksByRatio = (tasks: GenerationTask[]) => {
      const groups: { [key: string]: GenerationTask[] } = {};
      tasks.forEach(task => {
          if (!groups[task.aspectRatio]) groups[task.aspectRatio] = [];
          groups[task.aspectRatio].push(task);
      });
      return groups;
  };

  const portraitRatios: AspectRatio[] = ['1:1', '4:5', '3:4', '2:3', '9:16'];
  const landscapeRatios: AspectRatio[] = ['5:4', '4:3', '3:2', '16:9', '21:9'];

  const toggleRatio = (ratio: AspectRatio) => {
    const exists = params.aspectRatios.includes(ratio);
    if (exists && params.aspectRatios.length === 1) return;
    setParams(p => ({
        ...p,
        aspectRatios: exists 
            ? p.aspectRatios.filter(r => r !== ratio)
            : [...p.aspectRatios, ratio]
    }));
  };

  const groupedTasks = groupTasksByBatch(tasks);

  return (
    <div className="flex flex-col h-screen bg-black text-gray-100 font-sans selection:bg-peach-500/30">
      {/* --- Header --- */}
      <header className="flex items-center justify-between px-6 py-4 fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/90 to-transparent backdrop-blur-[2px] pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
            <div className="flex items-center justify-center drop-shadow-[0_0_8px_rgba(255,127,80,0.3)] select-none">
                <span className="text-3xl leading-none">🍑</span>
            </div>
            <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-peach-400 to-white leading-none">
                    Giga Peach
                </h1>
                <p className="text-[10px] text-gray-500 font-medium tracking-wide mt-0.5">Best Suite for Nano Banana</p>
            </div>
        </div>
        
        <div className="flex items-center gap-3 pointer-events-auto">
             {/* Social Links (Subtle) */}
             <div className="hidden md:flex items-center gap-3 mr-2">
                <a href="https://x.com/CocoSgt_twt" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-peach-400 transition-colors">
                    <Twitter size={16} />
                </a>
                <a href="https://github.com/CocoSgt/Giga-Peach" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-peach-400 transition-colors">
                    <Github size={16} />
                </a>
                <div className="h-4 w-px bg-gray-800"></div>
             </div>

             <button 
                onClick={() => setKeyModalOpen(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    apiKey 
                    ? 'bg-green-900/20 border-green-800 text-green-400 hover:bg-green-900/40' 
                    : 'bg-red-900/20 border-red-800 text-red-400 hover:bg-red-900/40 animate-pulse'
                }`}
            >
                <div className={`w-2 h-2 rounded-full ${apiKey ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="hidden sm:inline">{apiKey ? 'Connected' : 'Connect Key'}</span>
                <Key size={14} />
            </button>

            <div className="h-6 w-px bg-gray-800 mx-1"></div>

            <div className="flex bg-gray-900/80 backdrop-blur rounded-lg p-1 border border-gray-800 shadow-lg">
                <button 
                    onClick={() => setActiveTab('create')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'create' ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <span className="flex items-center gap-2"><Sparkles size={16}/> Create</span>
                </button>
                <button 
                    onClick={() => { setActiveTab('gallery'); loadGallery(); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'gallery' ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <span className="flex items-center gap-2"><History size={16}/> Gallery</span>
                </button>
            </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="flex-1 overflow-y-auto pt-24 pb-48 px-4 md:px-6 scrollbar-thin scrollbar-thumb-gray-800">
        
        {/* CREATE TAB */}
        {activeTab === 'create' && (
            <div className="max-w-7xl mx-auto space-y-8 min-h-[50vh]">
                {groupedTasks.length > 0 ? (
                    <div className="space-y-16 pb-12">
                        {groupedTasks.map((batch, index) => {
                            const firstItem = batch[0];
                            const refData = batch.find(t => t.data)?.data;
                            const promptText = firstItem.prompt;
                            const timestamp = refData?.timestamp || Date.now();
                            const styleId = refData?.styleId || selectedStyleId;
                            const styleName = allPresets.find(p => p.id === styleId)?.name || 'Custom';
                            const ratioGroups = groupTasksByRatio(batch);

                            return (
                                <div key={firstItem.batchId || index} className="group relative animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="absolute -left-6 top-6 bottom-0 w-px bg-gradient-to-b from-peach-500/50 to-transparent hidden md:block opacity-30"></div>
                                    <div className="mb-6 pl-0 md:pl-2">
                                        <p className="text-gray-200 text-lg font-light leading-relaxed max-w-4xl">{promptText}</p>
                                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 font-mono uppercase tracking-wider">
                                             <span className="text-peach-400">
                                                 {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                             </span>
                                             <span>•</span>
                                             {styleId && styleId !== 'none' && (
                                                <>
                                                    <span className="flex items-center gap-1 text-gray-400">
                                                        {styleName}
                                                    </span>
                                                    <span>•</span>
                                                </>
                                             )}
                                             <span>{params.resolution}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {Object.entries(ratioGroups).map(([ratio, groupTasks]) => (
                                            <div key={ratio} className="space-y-2">
                                                <div className="text-[10px] uppercase font-bold text-gray-600 pl-1 tracking-widest">{ratio}</div>
                                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                                    {groupTasks.map(task => (
                                                        <div key={task.id} className="transform transition-all duration-500 hover:scale-[1.01]">
                                                            <ImageCard 
                                                                task={task} 
                                                                onDelete={handleDeleteTask}
                                                                onIterate={handleIterate}
                                                                onView={setLightboxImage}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <button 
                                            onClick={() => handleRegenerateBatch(batch)}
                                            className="flex items-center gap-2 text-xs text-peach-500 hover:text-peach-400 transition-colors bg-peach-500/10 px-3 py-1.5 rounded-full border border-peach-500/20"
                                        >
                                            <RefreshCw size={12} />
                                            <span>Regenerate Batch</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                         <div ref={scrollEndRef} className="h-4" /> 
                    </div>
                ) : (
                    <div className="h-[60vh] flex flex-col items-center justify-center text-gray-600 space-y-6 animate-in fade-in zoom-in duration-700">
                        <div className="p-6 rounded-full bg-gray-900/50 border border-gray-800 shadow-[0_0_30px_rgba(255,127,80,0.2)]">
                            <span className="text-6xl select-none drop-shadow-[0_0_15px_rgba(255,127,80,0.5)] filter-none opacity-100">🍑</span>
                        </div>
                        <div className="text-center space-y-3">
                            <h3 className="text-2xl font-semibold text-gray-300">Batch Generate • Multi-Ratio • Style Transfer</h3>
                            <p className="text-sm max-w-sm text-gray-500 mx-auto">Select a style, adjust settings, and type a prompt to generate your vision.</p>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* GALLERY TAB */}
        {activeTab === 'gallery' && (
            <div className="max-w-7xl mx-auto">
                 <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                    {gallery.map(img => (
                        <div key={img.id} className="break-inside-avoid">
                            <ImageCard 
                                task={{
                                    id: img.id,
                                    status: 'success',
                                    aspectRatio: img.aspectRatio,
                                    prompt: img.prompt,
                                    data: img
                                }} 
                                onDelete={handleDeleteGallery}
                                onIterate={handleIterate}
                                onView={setLightboxImage}
                            />
                        </div>
                    ))}
                    {gallery.length === 0 && (
                        <div className="col-span-full text-center py-20 text-gray-500">
                            Gallery is empty.
                        </div>
                    )}
                </div>
            </div>
        )}
        
        {/* Footer Removed - Content moved to Header */}
      </main>

      {/* --- Floating Footer (Command Center) --- */}
      {activeTab === 'create' && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-col items-center justify-end pointer-events-none pb-6 px-4">
            
            <div className="w-full max-w-3xl pointer-events-auto flex flex-col items-center">
                
                {/* 1. Settings Tray (Collapsible) */}
                <div 
                    className={`w-full bg-gray-900/95 backdrop-blur-xl border border-gray-800 rounded-2xl mb-2 overflow-hidden transition-all duration-300 ease-out origin-bottom shadow-2xl ${
                        showConfig ? 'max-h-[400px] opacity-100 scale-100' : 'max-h-0 opacity-0 scale-95'
                    }`}
                >
                    <div className="p-4 space-y-4">
                        {/* Params Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Aspect Ratios */}
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Aspect Ratio</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {portraitRatios.map(ratio => (
                                        <div key={ratio} onClick={() => toggleRatio(ratio)} className="h-14">
                                            <AspectRatioIcon ratio={ratio} active={params.aspectRatios.includes(ratio)} orientation="portrait" />
                                        </div>
                                    ))}
                                    {landscapeRatios.map(ratio => (
                                        <div key={ratio} onClick={() => toggleRatio(ratio)} className="h-14">
                                            <AspectRatioIcon ratio={ratio} active={params.aspectRatios.includes(ratio)} orientation="landscape" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Count & Resolution */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Resolution</label>
                                    <div className="flex bg-black/40 rounded-lg p-1 border border-gray-800">
                                        {['1K', '2K', '4K'].map((res) => (
                                            <button
                                                key={res}
                                                onClick={() => setParams(p => ({ ...p, resolution: res as Resolution }))}
                                                className={`flex-1 py-1.5 text-xs rounded-md transition-all ${
                                                    params.resolution === res
                                                    ? 'bg-gray-700 text-white shadow-sm'
                                                    : 'text-gray-500 hover:text-gray-300'
                                                }`}
                                            >
                                                {res}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Image Count</label>
                                        <span className="text-xs font-mono text-peach-400">{params.count}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="8" 
                                        value={params.count}
                                        onChange={(e) => setParams(p => ({ ...p, count: parseInt(e.target.value) }))}
                                        className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-peach-500"
                                    />
                                    <div className="flex justify-between text-[9px] text-gray-600 font-mono">
                                        <span>1</span>
                                        <span>8</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Style Chips (Floating above Input) */}
                <div className="w-full mb-2 overflow-x-auto pb-1 scrollbar-none mask-gradient-x">
                    <div className="flex gap-2 items-center px-1">
                        {allPresets
                            .sort((a, b) => (a.id === 'none' ? -1 : b.id === 'none' ? 1 : 0))
                            .map(p => {
                            const isSelected = selectedStyleId === p.id;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedStyleId(p.id)}
                                    className={`relative group flex items-center gap-1.5 pl-3 pr-4 py-1.5 rounded-full text-xs whitespace-nowrap transition-all border ${
                                        isSelected 
                                        ? 'bg-gray-800 border-peach-500/50 text-peach-100 shadow-[0_0_10px_rgba(255,127,80,0.15)]' 
                                        : 'bg-black/40 backdrop-blur-md border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                    }`}
                                >
                                    {p.icon && <span className="text-sm">{p.icon}</span>}
                                    <span className="font-medium">{p.name}</span>
                                    
                                    {p.id !== 'none' && (
                                        <div 
                                            onClick={(e) => { e.stopPropagation(); openEditStyleModal(p); }}
                                            className={`ml-1 p-0.5 rounded-full hover:bg-gray-600 text-gray-500 hover:text-white transition-colors ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                        >
                                            <Settings size={10} />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                         <button
                            onClick={openCreateStyleModal}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors border border-dashed border-gray-700 text-gray-500 hover:border-peach-500 hover:text-peach-400 bg-black/20 backdrop-blur-md"
                        >
                            <Plus size={12} />
                            <span>New</span>
                        </button>
                    </div>
                </div>

                {/* 3. Main Input Bar */}
                <div className="w-full bg-black/80 backdrop-blur-xl border border-gray-800 rounded-[2rem] shadow-2xl flex flex-col p-1.5 gap-0 relative ring-1 ring-white/5">
                    
                    {/* Top: Uploaded Images Strip */}
                    {referenceImages.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto p-2 scrollbar-none">
                            {referenceImages.map((img, idx) => (
                                <div key={idx} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-700 group">
                                    <img src={img} className="w-full h-full object-cover" alt={`ref-${idx}`} />
                                    <button 
                                        onClick={() => removeReferenceImage(idx)}
                                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            {referenceImages.length < 6 && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex-shrink-0 w-16 h-16 rounded-lg border border-dashed border-gray-700 flex items-center justify-center text-gray-500 hover:text-peach-400 hover:border-peach-500 hover:bg-gray-800/50 transition-all"
                                >
                                    <Plus size={18} />
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex items-end gap-2 w-full">
                         {/* Left: Image Upload Trigger */}
                        <div className="relative flex-shrink-0 self-end mb-0.5 ml-0.5">
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                className="hidden" 
                                accept="image/*"
                                multiple
                                onChange={(e) => handleFileChange(e, false)}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={referenceImages.length >= 6}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all overflow-hidden border ${
                                    referenceImages.length > 0
                                    ? 'bg-peach-900/20 border-peach-500 text-peach-500' 
                                    : 'bg-gray-800 hover:bg-gray-700 border-transparent text-gray-400 hover:text-white'
                                }`}
                                title={referenceImages.length >= 6 ? "Max 6 images" : "Add Reference Image"}
                            >
                                <ImageIcon size={20} />
                            </button>
                            {referenceImages.length > 0 && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-peach-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                                    {referenceImages.length}
                                </div>
                            )}
                        </div>

                        {/* Center: Text Input */}
                        <textarea 
                            ref={promptInputRef}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleGenerate();
                                }
                            }}
                            onPaste={handlePaste}
                            placeholder={referenceImages.length > 0 ? "Describe changes to images..." : "Imagine something amazing..."}
                            className="flex-1 bg-transparent text-gray-200 placeholder:text-gray-600 text-sm p-3 focus:outline-none resize-none max-h-32 min-h-[44px] py-3 leading-relaxed scrollbar-none"
                            style={{ height: 'auto' }}
                            rows={1}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                            }}
                        />

                        {/* Right: Actions */}
                        <div className="flex items-center gap-1 self-end mb-0.5 mr-0.5">
                            {/* Config Summary */}
                            {!showConfig && (
                                <button 
                                    onClick={() => setShowConfig(true)}
                                    className="hidden sm:flex items-center gap-2 mr-2 px-3 py-1.5 rounded-full bg-gray-800/50 hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-all text-xs text-gray-400 hover:text-gray-200"
                                >
                                    <span className="font-medium text-peach-500/80">{params.aspectRatios.length > 2 ? `${params.aspectRatios.length} Ratios` : params.aspectRatios.join(', ')}</span>
                                    <span className="w-px h-3 bg-gray-700"></span>
                                    <span>{params.resolution}</span>
                                    <span className="w-px h-3 bg-gray-700"></span>
                                    <span>{params.count}</span>
                                </button>
                            )}

                            {/* Config Toggle */}
                            <button
                                onClick={() => setShowConfig(!showConfig)}
                                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${
                                    showConfig 
                                    ? 'bg-gray-800 text-peach-400 border-gray-700' 
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 border-transparent'
                                }`}
                                title="Settings"
                            >
                                <SlidersHorizontal size={18} />
                            </button>

                            {/* Generate Button */}
                            <button 
                                onClick={() => handleGenerate()}
                                className="h-10 px-4 rounded-full bg-gradient-to-r from-peach-600 to-peach-500 text-white font-semibold flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-peach-900/20"
                            >
                                <span>Run</span>
                                <Sparkles size={16} fill="currentColor" />
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
      )}

      {/* --- Lightbox --- */}
      {lightboxImage && (
          <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex items-center justify-center p-4">
              <button 
                onClick={() => setLightboxImage(null)}
                className="absolute top-4 right-4 p-2 bg-gray-800 rounded-full text-white hover:bg-gray-700"
              >
                  <X />
              </button>
              <img 
                src={lightboxImage.url} 
                alt={lightboxImage.prompt} 
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
              <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                  <p className="inline-block bg-black/50 px-4 py-2 rounded-full text-sm text-gray-300 backdrop-blur-sm border border-gray-800 max-w-2xl truncate">
                      {lightboxImage.prompt}
                  </p>
              </div>
          </div>
      )}

      {/* --- API Key Modal --- */}
      <Modal
        isOpen={isKeyModalOpen}
        onClose={() => { if(apiKey) setKeyModalOpen(false); }}
        title="Connect API Key"
      >
          <div className="space-y-6">
              <div className="p-4 bg-peach-900/10 border border-peach-900/30 rounded-lg">
                  <p className="text-sm text-peach-200">
                      Giga Peach uses the Gemini API directly from your browser. Your key is stored locally and never sent to our servers.
                  </p>
              </div>

              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Google API Key</label>
                      <input 
                        ref={keyInputRef}
                        type="password"
                        defaultValue={apiKey}
                        placeholder="AIzaSy..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-peach-500 focus:outline-none font-mono text-sm"
                      />
                      <div className="mt-2 text-right">
                          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-peach-400 hover:text-peach-300 flex items-center justify-end gap-1">
                              Get API Key <Sparkles size={10} />
                          </a>
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                          Custom Base URL <span className="text-gray-600 text-xs font-normal">(Optional)</span>
                      </label>
                      <input 
                        id="base-url-input"
                        type="text"
                        defaultValue={baseUrl}
                        placeholder="https://generativelanguage.googleapis.com"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-peach-500 focus:outline-none font-mono text-sm placeholder:text-gray-600"
                      />
                  </div>
              </div>

              <div className="flex gap-3 pt-2">
                  <button 
                    onClick={handleSaveKey}
                    className="flex-1 bg-peach-600 hover:bg-peach-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-peach-900/20"
                  >
                      Save & Connect
                  </button>
                  {apiKey && (
                       <button 
                        onClick={handleClearKey}
                        className="px-4 border border-gray-700 text-gray-400 hover:text-white hover:border-red-500/50 hover:bg-red-900/10 rounded-xl transition-colors"
                        title="Remove Key"
                       >
                           <Trash2 size={18} />
                       </button>
                  )}
              </div>
          </div>
      </Modal>

      {/* --- Style Modal (Create/Edit) --- */}
      <Modal 
        isOpen={isStyleModalOpen} 
        onClose={() => setStyleModalOpen(false)} 
        title={editingStyleId ? "Edit Style" : "Create New Style"}
      >
          <div className="space-y-4">
              <div className="flex gap-4">
                  <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">Style Name</label>
                      <input 
                        type="text" 
                        value={styleFormName}
                        onChange={(e) => setStyleFormName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white focus:border-peach-500 focus:outline-none"
                        placeholder="e.g., Neon Noir"
                      />
                  </div>
                  <div>
                      <label className="block text-sm text-gray-400 mb-1">Icon</label>
                      <input 
                        type="text" 
                        value={styleFormIcon}
                        onChange={(e) => setStyleFormIcon(e.target.value)}
                        className="w-16 text-center bg-gray-800 border border-gray-700 rounded-lg p-2 text-white focus:border-peach-500 focus:outline-none"
                        placeholder="Icon"
                        maxLength={4} 
                      />
                  </div>
              </div>
              
              <div>
                  <label className="block text-sm text-gray-400 mb-1">Style Description (Prompt Prefix)</label>
                  <textarea 
                    value={styleFormDesc}
                    onChange={(e) => setStyleFormDesc(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white h-24 focus:border-peach-500 focus:outline-none"
                    placeholder="Describe the aesthetic..."
                  />
              </div>

              <div>
                  <label className="block text-sm text-gray-400 mb-2">Style Reference Images (Optional, Max 6)</label>
                  <input 
                    type="file" 
                    ref={styleImageInputRef}
                    className="hidden" 
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileChange(e, true)}
                  />
                  
                  <div className="flex flex-wrap gap-2 mb-2">
                       {styleFormImages.map((img, idx) => (
                          <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-700 group">
                               <img src={img} alt="Style Ref" className="w-full h-full object-cover" />
                               <button 
                                    onClick={() => removeStyleImage(idx)}
                                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={16} className="text-white" />
                               </button>
                          </div>
                       ))}
                       
                       {styleFormImages.length < 6 && (
                           <button 
                                onClick={() => styleImageInputRef.current?.click()}
                                className="w-20 h-20 rounded-lg border border-dashed border-gray-700 flex flex-col items-center justify-center bg-gray-800/50 hover:bg-gray-800 hover:border-peach-500 transition-colors text-gray-500 hover:text-peach-400"
                            >
                                <Plus size={20} />
                                <span className="text-[10px] mt-1">Add</span>
                            </button>
                       )}
                  </div>
                  <p className="text-[10px] text-gray-500">
                     These images will be sent to the model every time you use this style to guide the generation.
                  </p>
              </div>

              <div className="pt-2 flex gap-3">
                 <button 
                    onClick={handleSaveStyle}
                    disabled={!styleFormName || !styleFormDesc}
                    className="flex-1 bg-peach-600 hover:bg-peach-500 text-white font-bold py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      {editingStyleId ? "Save Changes" : "Create Style"}
                  </button>
                  
                  {editingStyleId && (
                      <button 
                        onClick={handleDeleteStyle}
                        className="px-4 bg-red-900/50 hover:bg-red-900/80 text-red-200 border border-red-900/50 rounded-lg transition-colors"
                        title="Delete Style"
                      >
                          <Trash2 size={18} />
                      </button>
                  )}
              </div>
          </div>
      </Modal>

    </div>
  );
}