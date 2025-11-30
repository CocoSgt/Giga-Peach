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
    SlidersHorizontal, Key, Github, Twitter,
    Heart, ChevronLeft, ChevronRight, Download, MessageSquare
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
  const [activeTab, setActiveTab] = useState<'create' | 'gallery' | 'favorites'>('create');
  
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
  const [showConfig, setShowConfig] = useState(false);

  // Data
  const [allPresets, setAllPresets] = useState<StylePreset[]>([]);
  const [tasks, setTasks] = useState<GenerationTask[]>([]); // Current session tasks
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  
  // UI - Lightbox
  const [lightboxState, setLightboxState] = useState<{
      isOpen: boolean;
      images: GeneratedImage[];
      currentIndex: number;
  }>({ isOpen: false, images: [], currentIndex: 0 });
  
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
      
      const images = await getGallery();
      setGallery(images);
      
      // Rehydrate tasks from gallery for persistent history
      // Gallery is sorted desc (newest first), tasks are usually oldest first in the list view (appended)
      const historyTasks: GenerationTask[] = images.map(img => ({
          id: img.id,
          batchId: img.batchId,
          // Fix: status needs to be a specific literal, not string
          status: 'success' as const,
          aspectRatio: img.aspectRatio,
          prompt: img.prompt,
          data: img,
          placeholder: false
      })).reverse();
      setTasks(historyTasks);
      
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
        // Only scroll if we added new tasks (naive check or just on every update)
        // We use a small timeout to let DOM render
        setTimeout(() => {
            scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
  }, [tasks.length, activeTab]);

  // Auto-resize textarea
  useEffect(() => {
      if (promptInputRef.current) {
          promptInputRef.current.style.height = 'auto';
          // Let CSS max-height handle the scrolling limit
          promptInputRef.current.style.height = `${promptInputRef.current.scrollHeight}px`;
      }
  }, [prompt]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
      if (!lightboxState.isOpen) return;

      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
              handleNextImage();
          } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
              handlePrevImage();
          } else if (e.key === 'Escape') {
              setLightboxState(prev => ({ ...prev, isOpen: false }));
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxState.isOpen, lightboxState.currentIndex, lightboxState.images.length]);

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

  const handleToggleFavorite = async (image: GeneratedImage) => {
      const newStatus = !image.isFavorite;
      const updatedImage = { ...image, isFavorite: newStatus };
      
      // Update DB
      await saveImage(updatedImage);
      
      // Update State (Gallery & Tasks)
      setGallery(prev => prev.map(img => img.id === image.id ? updatedImage : img));
      setTasks(prev => prev.map(t => t.data?.id === image.id ? { ...t, data: updatedImage } : t));
      
      // Update Lightbox if open
      if (lightboxState.isOpen) {
          setLightboxState(prev => ({
              ...prev,
              images: prev.images.map(img => img.id === image.id ? updatedImage : img)
          }));
      }
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

    // Fix: If retrying, do not re-append style images. Use provided refs as absolute truth.
    // If not retrying, append style images to current input images.
    const finalRefImages = retryRefImages 
        ? retryRefImages 
        : [...(effectiveRefImages), ...(style?.referenceImages || [])];

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
      setLightboxState(prev => ({ ...prev, isOpen: false }));
  };

  const handleDeleteTask = (id: string) => {
      setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleDeleteGallery = async (id: string) => {
      await deleteImage(id);
      loadGallery();
      // If deleted in lightbox, close or switch
      if (lightboxState.isOpen && lightboxState.images[lightboxState.currentIndex]?.id === id) {
          setLightboxState(prev => ({ ...prev, isOpen: false }));
      }
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

  // --- Lightbox Logic ---
  
  const openLightbox = (image: GeneratedImage, sourceList?: GeneratedImage[]) => {
      // Determine the list context
      let list = sourceList;
      if (!list) {
          // Fallback context based on active tab
          if (activeTab === 'gallery') list = gallery;
          else if (activeTab === 'favorites') list = gallery.filter(img => img.isFavorite);
          else {
              // Create tab: flatten current tasks with data
              list = tasks
                  .filter(t => t.status === 'success' && t.data)
                  .map(t => t.data!)
                  .reverse(); // Assuming typical reverse chrono order in UI
          }
      }
      
      const index = list.findIndex(img => img.id === image.id);
      setLightboxState({
          isOpen: true,
          images: list,
          currentIndex: index !== -1 ? index : 0
      });
  };

  const handleNextImage = () => {
      setLightboxState(prev => ({
          ...prev,
          currentIndex: (prev.currentIndex + 1) % prev.images.length
      }));
  };

  const handlePrevImage = () => {
      setLightboxState(prev => ({
          ...prev,
          currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length
      }));
  };

  // --- Grouping Logic ---

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
  const favoriteImages = gallery.filter(img => img.isFavorite);

  return (
    <div className="flex flex-col h-screen bg-black text-gray-100 font-sans selection:bg-peach-500/30">
      {/* --- Header --- */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/90 to-transparent backdrop-blur-[2px] pointer-events-none">
        <div 
            onClick={() => setActiveTab('create')}
            className="flex items-center gap-4 pointer-events-auto cursor-pointer group select-none"
        >
            <div className="flex items-center justify-center drop-shadow-[0_0_8px_rgba(255,127,80,0.3)] transition-transform group-hover:scale-110 duration-300">
                <span className="text-4xl leading-none">🍑</span>
            </div>
            <div className="hidden sm:block">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-peach-400 to-white leading-none transition-all group-hover:text-peach-200">
                    Giga Peach
                </h1>
                <p className="text-xs text-gray-500 font-medium tracking-wide mt-1">Best Suite for Nano Banana</p>
            </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4 pointer-events-auto">
             {/* Social Links (Subtle) & Badges */}
             <div className="hidden lg:flex items-center gap-4 mr-2">
                 {/* Open Source Badge */}
                <a 
                    href="https://github.com/CocoSgt/Giga-Peach" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900/50 border border-gray-700/50 text-xs font-medium text-gray-400 hover:text-white hover:border-peach-500/50 transition-all group"
                >
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.4)]"></div>
                    <span className="group-hover:text-gray-200">Open Source</span>
                </a>

                <div className="h-5 w-px bg-gray-800 mx-1"></div>

                <a href="https://x.com/CocoSgt_twt" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-peach-400 transition-colors p-1">
                    <Twitter size={18} />
                </a>
                <a href="https://github.com/CocoSgt/Giga-Peach" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-peach-400 transition-colors p-1">
                    <Github size={18} />
                </a>
                <div className="h-5 w-px bg-gray-800"></div>
             </div>

             <button 
                onClick={() => setKeyModalOpen(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                    apiKey 
                    ? 'bg-green-900/20 border-green-800 text-green-400 hover:bg-green-900/40' 
                    : 'bg-red-900/20 border-red-800 text-red-400 hover:bg-red-900/40 animate-pulse'
                }`}
            >
                <div className={`w-2 h-2 rounded-full ${apiKey ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="hidden sm:inline">{apiKey ? 'Connected' : 'Connect Key'}</span>
                <Key size={16} />
            </button>

            <div className="hidden md:block h-8 w-px bg-gray-800 mx-1"></div>

            <div className="flex bg-gray-900/80 backdrop-blur rounded-xl p-1.5 border border-gray-800 shadow-lg">
                <button 
                    onClick={() => setActiveTab('create')}
                    className={`px-4 md:px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'create' ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' : 'text-gray-400 hover:text-gray-200'}`}
                    title="Create"
                >
                    <span className="flex items-center gap-2"><Sparkles size={18}/> <span className="hidden sm:inline">Create</span></span>
                </button>
                <button 
                    onClick={() => { setActiveTab('gallery'); loadGallery(); }}
                    className={`px-4 md:px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'gallery' ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' : 'text-gray-400 hover:text-gray-200'}`}
                    title="Gallery"
                >
                    <span className="flex items-center gap-2"><History size={18}/> <span className="hidden sm:inline">Gallery</span></span>
                </button>
                <button 
                    onClick={() => { setActiveTab('favorites'); loadGallery(); }}
                    className={`px-4 md:px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'favorites' ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' : 'text-gray-400 hover:text-gray-200'}`}
                    title="Collection"
                >
                     <span className="flex items-center gap-2"><Heart size={18} fill={activeTab === 'favorites' ? "currentColor" : "none"}/><span className="hidden sm:inline">Collection</span></span>
                </button>
            </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="flex-1 overflow-y-auto pt-28 pb-48 px-4 md:px-8 scrollbar-thin scrollbar-thumb-gray-800">
        
        {/* CREATE TAB */}
        {activeTab === 'create' && (
            <div className="max-w-[1800px] mx-auto space-y-10 min-h-[50vh]">
                {groupedTasks.length > 0 ? (
                    <div className="space-y-20 pb-12">
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
                                    <div className="absolute -left-8 top-6 bottom-0 w-px bg-gradient-to-b from-peach-500/50 to-transparent hidden md:block opacity-30"></div>
                                    <div className="mb-8 pl-0 md:pl-4">
                                        <p className="text-gray-200 text-xl font-light leading-relaxed max-w-5xl">{promptText}</p>
                                        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500 font-mono uppercase tracking-wider">
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

                                    <div className="space-y-8">
                                        {Object.entries(ratioGroups).map(([ratio, groupTasks]) => (
                                            <div key={ratio} className="space-y-3">
                                                <div className="text-xs uppercase font-bold text-gray-600 pl-1 tracking-widest">{ratio}</div>
                                                {/* Bigger Grid: md:grid-cols-3, lg:grid-cols-4 instead of 4/5 */}
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 xl:gap-6">
                                                    {groupTasks.map(task => (
                                                        <div key={task.id} className="transform transition-all duration-500 hover:scale-[1.01]">
                                                            <ImageCard 
                                                                task={task} 
                                                                onDelete={handleDeleteTask}
                                                                onIterate={handleIterate}
                                                                onView={(img) => openLightbox(img)}
                                                                onToggleFavorite={handleToggleFavorite}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="mt-6 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <button 
                                            onClick={() => handleRegenerateBatch(batch)}
                                            className="flex items-center gap-2 text-sm text-peach-500 hover:text-peach-400 transition-colors bg-peach-500/10 px-4 py-2 rounded-full border border-peach-500/20"
                                        >
                                            <RefreshCw size={14} />
                                            <span>Regenerate Batch</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                         <div ref={scrollEndRef} className="h-8" /> 
                    </div>
                ) : (
                    <div className="h-[65vh] flex flex-col items-center justify-center text-gray-600 space-y-8 animate-in fade-in zoom-in duration-700">
                        <div className="p-8 rounded-full bg-gray-900/50 border border-gray-800 shadow-[0_0_40px_rgba(255,127,80,0.2)]">
                            <span className="text-7xl select-none drop-shadow-[0_0_20px_rgba(255,127,80,0.5)] filter-none opacity-100">🍑</span>
                        </div>
                        <div className="text-center space-y-4">
                            <h3 className="text-3xl font-semibold text-gray-300">Batch Generate • Multi-Ratio</h3>
                            <p className="text-base max-w-sm text-gray-500 mx-auto">make Nano feel Giga</p>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* GALLERY & FAVORITES TAB */}
        {(activeTab === 'gallery' || activeTab === 'favorites') && (
            <div className="max-w-[1800px] mx-auto">
                 {/* Bigger Columns for Gallery too */}
                 <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 xl:gap-6 space-y-4 xl:space-y-6">
                    {(activeTab === 'favorites' ? favoriteImages : gallery).map(img => (
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
                                onView={(img) => openLightbox(img, activeTab === 'favorites' ? favoriteImages : gallery)}
                                onToggleFavorite={handleToggleFavorite}
                            />
                        </div>
                    ))}
                    {(activeTab === 'favorites' ? favoriteImages : gallery).length === 0 && (
                        <div className="col-span-full text-center py-32 text-gray-500 text-lg">
                            {activeTab === 'favorites' ? 'No favorites yet.' : 'Gallery is empty.'}
                        </div>
                    )}
                </div>
            </div>
        )}
      </main>

      {/* --- Floating Footer (Command Center) --- */}
      {activeTab === 'create' && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-col items-center justify-end pointer-events-none pb-8 px-4">
            
            <div className="w-full max-w-4xl pointer-events-auto flex flex-col items-center">
                
                {/* 1. Settings Tray (Collapsible) */}
                <div 
                    className={`w-full bg-gray-900/95 backdrop-blur-xl border border-gray-800 rounded-3xl mb-3 overflow-hidden transition-all duration-300 ease-out origin-bottom shadow-2xl ${
                        showConfig ? 'max-h-[600px] opacity-100 scale-100' : 'max-h-0 opacity-0 scale-95'
                    }`}
                >
                    <div className="p-6 space-y-6 relative">
                        {/* Close Button */}
                        <button 
                            onClick={() => setShowConfig(false)}
                            className="absolute top-3 right-3 p-2 text-gray-500 hover:text-white rounded-full hover:bg-gray-800 transition-colors z-10"
                            title="Close Settings"
                        >
                            <X size={20} />
                        </button>

                        {/* Params Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Aspect Ratios */}
                            <div className="space-y-3">
                                <div className="text-sm font-medium text-peach-500 mb-2">Nano Banana Settings</div>
                                <label className="text-xs uppercase font-bold text-gray-500 tracking-wider">Aspect Ratio</label>
                                <div className="grid grid-cols-5 gap-3">
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
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-xs uppercase font-bold text-gray-500 tracking-wider">Resolution</label>
                                    <div className="flex bg-black/40 rounded-xl p-1.5 border border-gray-800">
                                        {['1K', '2K', '4K'].map((res) => (
                                            <button
                                                key={res}
                                                onClick={() => setParams(p => ({ ...p, resolution: res as Resolution }))}
                                                className={`flex-1 py-2 text-sm rounded-lg transition-all ${
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

                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <label className="text-xs uppercase font-bold text-gray-500 tracking-wider">Image Count</label>
                                        <span className="text-sm font-mono text-peach-400">{params.count}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="8" 
                                        value={params.count}
                                        onChange={(e) => setParams(p => ({ ...p, count: parseInt(e.target.value) }))}
                                        className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-peach-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-600 font-mono">
                                        <span>1</span>
                                        <span>8</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Style Chips (Floating above Input) */}
                <div className="w-full mb-3 overflow-x-auto pb-1 scrollbar-none mask-gradient-x">
                    <div className="flex gap-2.5 items-center px-1">
                        {allPresets
                            .sort((a, b) => (a.id === 'none' ? -1 : b.id === 'none' ? 1 : 0))
                            .map(p => {
                            const isSelected = selectedStyleId === p.id;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedStyleId(p.id)}
                                    className={`relative group flex items-center gap-2 pl-4 pr-5 py-2 rounded-full text-sm whitespace-nowrap transition-all border ${
                                        isSelected 
                                        ? 'bg-gray-800 border-peach-500/50 text-peach-100 shadow-[0_0_10px_rgba(255,127,80,0.15)]' 
                                        : 'bg-black/40 backdrop-blur-md border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                    }`}
                                >
                                    {p.icon && <span className="text-base">{p.icon}</span>}
                                    <span className="font-medium">{p.name}</span>
                                    
                                    {p.id !== 'none' && (
                                        <div 
                                            onClick={(e) => { e.stopPropagation(); openEditStyleModal(p); }}
                                            className={`ml-1 p-0.5 rounded-full hover:bg-gray-600 text-gray-500 hover:text-white transition-colors ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                        >
                                            <Settings size={12} />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                         <button
                            onClick={openCreateStyleModal}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors border border-dashed border-gray-700 text-gray-500 hover:border-peach-500 hover:text-peach-400 bg-black/20 backdrop-blur-md"
                        >
                            <Plus size={14} />
                            <span>New</span>
                        </button>
                    </div>
                </div>

                {/* 3. Main Input Bar - Larger Padding/Height */}
                <div className="w-full bg-black/80 backdrop-blur-xl border border-gray-800 rounded-3xl md:rounded-[2.5rem] shadow-2xl flex flex-col p-3 md:p-2 gap-0 relative ring-1 ring-white/5">
                    
                    {/* Top: Uploaded Images Strip */}
                    {referenceImages.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto p-2 scrollbar-none mb-1">
                            {referenceImages.map((img, idx) => (
                                <div key={idx} className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-gray-700 group">
                                    <img src={img} className="w-full h-full object-cover" alt={`ref-${idx}`} />
                                    <button 
                                        onClick={() => removeReferenceImage(idx)}
                                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            ))}
                            {referenceImages.length < 6 && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex-shrink-0 w-20 h-20 rounded-xl border border-dashed border-gray-700 flex items-center justify-center text-gray-500 hover:text-peach-400 hover:border-peach-500 hover:bg-gray-800/50 transition-all"
                                >
                                    <Plus size={24} />
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row md:items-end gap-3 w-full">
                         
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            className="hidden" 
                            accept="image/*"
                            multiple
                            onChange={(e) => handleFileChange(e, false)}
                        />

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
                            placeholder={referenceImages.length > 0 ? "Describe changes..." : "Imagine..."}
                            className="order-1 md:order-2 flex-1 w-full bg-transparent text-gray-200 placeholder:text-gray-600 text-base md:text-lg p-3 md:p-5 focus:outline-none resize-none min-h-[40px] md:min-h-[60px] max-h-[100px] md:max-h-[208px] py-3 leading-relaxed scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                            rows={1}
                        />

                        {/* Wrapper for Bottom/Side Controls */}
                        <div className="order-2 md:contents flex justify-between items-center w-full mt-1 md:mt-0">
                            
                            {/* Left: Image Upload Trigger */}
                            <div className="md:order-1 relative flex-shrink-0 mb-0.5 ml-1 md:ml-3 md:mb-3">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={referenceImages.length >= 6}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all overflow-hidden border ${
                                        referenceImages.length > 0
                                        ? 'bg-peach-900/20 border-peach-500 text-peach-500' 
                                        : 'bg-gray-800 hover:bg-gray-700 border-transparent text-gray-400 hover:text-white'
                                    }`}
                                    title={referenceImages.length >= 6 ? "Max 6 images" : "Add Reference Image"}
                                >
                                    <ImageIcon size={24} />
                                </button>
                                {referenceImages.length > 0 && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-peach-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                                        {referenceImages.length}
                                    </div>
                                )}
                            </div>

                            {/* Right: Actions */}
                            <div className="md:order-3 flex items-center gap-2 md:gap-3 mb-0.5 mr-1 md:mr-2 md:mb-3">
                                {/* Config Summary */}
                                {!showConfig && (
                                    <button 
                                        onClick={() => setShowConfig(true)}
                                        className="flex items-center gap-3 mr-2 px-4 py-2 rounded-full bg-gray-800/50 hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-all text-xs md:text-sm text-gray-400 hover:text-gray-200 overflow-hidden max-w-[150px] md:max-w-none whitespace-nowrap"
                                    >
                                        <span className="font-medium text-peach-500/80 truncate">{params.aspectRatios.length > 2 ? `${params.aspectRatios.length} Ratios` : params.aspectRatios.join(', ')}</span>
                                        <span className="w-px h-3 bg-gray-700 flex-shrink-0"></span>
                                        <span className="flex-shrink-0">{params.resolution}</span>
                                        <span className="w-px h-3 bg-gray-700 flex-shrink-0"></span>
                                        <span className="flex-shrink-0">{params.count}</span>
                                    </button>
                                )}

                                {/* Config Toggle */}
                                <button
                                    onClick={() => setShowConfig(!showConfig)}
                                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all border ${
                                        showConfig 
                                        ? 'bg-gray-800 text-peach-400 border-gray-700' 
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 border-transparent'
                                    }`}
                                    title="Settings"
                                >
                                    <SlidersHorizontal size={20} />
                                </button>

                                {/* Generate Button */}
                                <button 
                                    onClick={() => handleGenerate()}
                                    className="h-12 px-6 rounded-full bg-gradient-to-r from-peach-600 to-peach-500 text-white font-semibold flex items-center gap-2.5 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-peach-900/20 text-base"
                                >
                                    <span className="hidden sm:inline">Run</span>
                                    <Sparkles size={18} fill="currentColor" />
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
      )}

      {/* --- Lightbox --- */}
      {lightboxState.isOpen && lightboxState.images.length > 0 && (
          <div className="fixed inset-0 z-[100] bg-black/98 backdrop-blur flex items-center justify-center animate-in fade-in duration-200" onClick={() => setLightboxState(prev => ({ ...prev, isOpen: false }))}>
              
              {/* Image Container */}
              <div 
                className="relative max-w-full max-h-full p-4 md:p-12 flex items-center justify-center h-full w-full" 
                onClick={(e) => {
                    setLightboxState(prev => ({ ...prev, isOpen: false }));
                }}
              >
                  <img 
                    src={lightboxState.images[lightboxState.currentIndex].url} 
                    alt={lightboxState.images[lightboxState.currentIndex].prompt} 
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-zoom-out select-none"
                    onClick={(e) => {
                        e.stopPropagation();
                        setLightboxState(prev => ({ ...prev, isOpen: false }));
                    }}
                  />
                  
                  {/* Close Button */}
                  <button 
                    onClick={() => setLightboxState(prev => ({ ...prev, isOpen: false }))}
                    className="absolute top-6 right-6 p-3 bg-gray-800/50 hover:bg-gray-800 rounded-full text-white transition-colors z-20"
                  >
                      <X size={24} />
                  </button>

                  {/* Navigation Arrows */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 md:px-8 pointer-events-none">
                       <button 
                            onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                            className="pointer-events-auto p-4 rounded-full bg-black/20 hover:bg-black/60 text-white/50 hover:text-white transition-all backdrop-blur-sm"
                       >
                           <ChevronLeft size={48} />
                       </button>
                       <button 
                            onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                            className="pointer-events-auto p-4 rounded-full bg-black/20 hover:bg-black/60 text-white/50 hover:text-white transition-all backdrop-blur-sm"
                       >
                           <ChevronRight size={48} />
                       </button>
                  </div>

                  {/* Info Overlay */}
                  <div 
                    className="absolute bottom-8 left-0 right-0 text-center pointer-events-none px-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                      <div className="inline-flex flex-col items-center gap-2 pointer-events-auto">
                        <p className="bg-black/60 px-6 py-3 rounded-2xl text-base text-gray-200 backdrop-blur-md border border-white/10 max-w-3xl line-clamp-2">
                            {lightboxState.images[lightboxState.currentIndex].prompt}
                        </p>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleIterate(lightboxState.images[lightboxState.currentIndex])}
                                className="p-3 bg-black/40 border border-white/10 rounded-full text-gray-400 hover:text-peach-400 hover:bg-white/10 transition-colors backdrop-blur-md"
                                title="Iterate / Chat"
                            >
                                <MessageSquare size={20} />
                            </button>
                            <button
                                onClick={() => handleToggleFavorite(lightboxState.images[lightboxState.currentIndex])}
                                className={`p-3 rounded-full backdrop-blur-md border transition-colors ${
                                    lightboxState.images[lightboxState.currentIndex].isFavorite
                                    ? 'bg-red-500/20 text-red-500 border-red-500/30' 
                                    : 'bg-black/40 text-gray-400 border-white/10 hover:bg-white/10'
                                }`}
                            >
                                <Heart size={20} fill={lightboxState.images[lightboxState.currentIndex].isFavorite ? "currentColor" : "none"} />
                            </button>
                            <a 
                                href={lightboxState.images[lightboxState.currentIndex].url} 
                                download={`giga-peach-${lightboxState.images[lightboxState.currentIndex].id}.png`}
                                className="p-3 bg-black/40 border border-white/10 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-md"
                            >
                                <Download size={20} />
                            </a>
                        </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- API Key Modal --- */}
      <Modal
        isOpen={isKeyModalOpen}
        onClose={() => { if(apiKey) setKeyModalOpen(false); }}
        title="Connect API Key"
      >
          {/* ... existing modal content ... */}
          <div className="space-y-6">
              <div className="p-4 bg-peach-900/10 border border-peach-900/30 rounded-lg">
                  <p className="text-sm text-peach-200">
                      This API Key is used to call Nano Banana. Giga Peach uses the Gemini API directly from your browser. Your key is stored locally and never sent to our servers.
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
          {/* ... existing modal content ... */}
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