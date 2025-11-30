import React, { useState } from 'react';
import { Download, MessageSquare, Maximize2, Trash2 } from './Icons';
import { GeneratedImage, GenerationTask } from '../types';

interface ImageCardProps {
  task: GenerationTask;
  onDelete?: (id: string) => void;
  onIterate?: (image: GeneratedImage) => void;
  onView?: (image: GeneratedImage) => void;
}

export const ImageCard: React.FC<ImageCardProps> = ({ task, onDelete, onIterate, onView }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Aspect ratio class mapping
  const aspectClasses = {
    '1:1': 'aspect-square',
    '3:4': 'aspect-[3/4]',
    '4:3': 'aspect-[4/3]',
    '9:16': 'aspect-[9/16]',
    '16:9': 'aspect-[video]',
    '2:3': 'aspect-[2/3]',
    '3:2': 'aspect-[3/2]',
    '4:5': 'aspect-[4/5]',
    '5:4': 'aspect-[5/4]',
    '21:9': 'aspect-[21/9]'
  };

  const containerClass = `relative group rounded-xl overflow-hidden bg-gray-900 border border-gray-800 ${aspectClasses[task.aspectRatio] || 'aspect-square'}`;

  if (task.status === 'pending' || task.status === 'generating') {
    return (
      <div className={`${containerClass} flex items-center justify-center relative`}>
        <div className="flex flex-col items-center gap-2 z-10">
          <div className="w-8 h-8 border-2 border-peach-500 border-t-transparent rounded-full animate-spin" />
        </div>
        {/* Ratio Badge for Placeholder */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur rounded text-[9px] font-mono text-gray-400 border border-white/10">
            {task.aspectRatio}
        </div>
      </div>
    );
  }

  if (task.status === 'error' || !task.data) {
    return (
      <div className={`${containerClass} flex items-center justify-center bg-red-900/10 border-red-900/30 relative`}>
         <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur rounded text-[9px] font-mono text-gray-400 border border-white/10">
            {task.aspectRatio}
        </div>
        <span className="text-xs text-red-400 px-2 text-center">Failed</span>
      </div>
    );
  }

  return (
    <div 
      className={containerClass}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img 
        src={task.data.url} 
        alt={task.data.prompt} 
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* Ratio Badge */}
      <div className={`absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur rounded text-[9px] font-mono text-gray-300 border border-white/10 transition-opacity ${isHovered ? 'opacity-0' : 'opacity-100'}`}>
         {task.aspectRatio}
      </div>
      
      {/* Overlay Actions */}
      <div className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col justify-between p-3 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex justify-end gap-2">
           {onDelete && (
             <button 
                onClick={() => onDelete(task.id)}
                className="p-2 bg-gray-800/80 rounded-full hover:bg-red-500/80 hover:text-white text-gray-300 transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
           )}
        </div>
        
        <div className="flex gap-2 justify-center">
            {onIterate && (
                <button 
                    onClick={() => onIterate(task.data!)}
                    className="p-2 bg-gray-800/80 rounded-full hover:bg-peach-500 hover:text-white text-gray-300 transition-colors"
                    title="Iterate / Chat"
                >
                    <MessageSquare size={16} />
                </button>
            )}
             <button 
                onClick={() => onView && onView(task.data!)}
                className="p-2 bg-gray-800/80 rounded-full hover:bg-blue-500 hover:text-white text-gray-300 transition-colors"
                title="View Fullscreen"
            >
                <Maximize2 size={16} />
            </button>
             <a 
                href={task.data.url} 
                download={`giga-peach-${task.id}.png`}
                className="p-2 bg-gray-800/80 rounded-full hover:bg-green-500 hover:text-white text-gray-300 transition-colors"
                title="Download"
            >
                <Download size={16} />
            </a>
        </div>
      </div>
    </div>
  );
};