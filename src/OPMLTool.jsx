import React, { useState, useRef } from 'react';
import { 
  FileInput, 
  FolderPlus, 
  FilePlus, 
  Trash2,
  Download,
  ChevronDown,
  ChevronRight,
  Rss,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// 替换react-beautiful-dnd为@dnd-kit
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const OPMLTool = () => {
  const [opmlData, setOpmlData] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [selectedItem, setSelectedItem] = useState(null);
  const [editValues, setEditValues] = useState({
    text: '',
    xmlUrl: '',
    htmlUrl: ''
  });
  const [activeId, setActiveId] = useState(null);
  const fileInputRef = useRef(null);

  // 设置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Import OPML file
  const handleFileImport = (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(event?.target?.result, "text/xml");
        const outlines = xmlDoc.getElementsByTagName("outline");
        
        const parseOutline = (outline) => {
          const children = [];
          // Only process direct child nodes to avoid duplicate parsing
          for (let i = 0; i < outline.children.length; i++) {
            children.push(parseOutline(outline.children[i]));
          }
          
          return {
            text: outline.getAttribute("text"),
            // Fix: Correctly determine node type, if it has children then it's a folder, otherwise it's an RSS
            type: outline.getAttribute("type") || (children.length > 0 ? "folder" : "rss"),
            xmlUrl: outline.getAttribute("xmlUrl"),
            htmlUrl: outline.getAttribute("htmlUrl"),
            children: children.length > 0 ? children : null // If no child nodes, set to null instead of empty array
          };
        };

        // Only process top-level nodes to avoid duplicate parsing
        const parsedData = [];
        // Find top-level outline elements to avoid processing nested outlines
        const topLevelOutlines = [];
        for (let i = 0; i < outlines.length; i++) {
          // Check if it's a top-level node (parent node is not an outline)
          const parent = outlines[i].parentNode;
          if (parent.tagName.toLowerCase() !== 'outline') {
            topLevelOutlines.push(outlines[i]);
          }
        }
        
        for (let i = 0; i < topLevelOutlines.length; i++) {
          parsedData.push(parseOutline(topLevelOutlines[i]));
        }

        setOpmlData(parsedData);
      } catch (error) {
        console.error("Error parsing OPML:", error);
      }
    };
    reader.readAsText(file);
  };

  // Toggle folder expansion state
  const toggleFolder = (path) => {
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  // 当选择一个项目时，初始化编辑值
  const handleSelectItem = (item, path) => {
    setSelectedItem({ ...item, path });
    setEditValues({
      text: item.text || '',
      xmlUrl: item.xmlUrl || '',
      htmlUrl: item.htmlUrl || ''
    });
  };

  // 处理编辑值变化
  const handleEditChange = (field, value) => {
    setEditValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 保存编辑
  const saveEdit = () => {
    if (!selectedItem) return;

    const updateItem = (data, pathArray, values) => {
      if (pathArray.length === 0) return data;
      
      const [current, ...rest] = pathArray;
      return data.map((item, index) => {
        if (index === current) {
          if (rest.length === 0) {
            return { 
              ...item, 
              text: values.text,
              xmlUrl: item.type === 'rss' ? values.xmlUrl : item.xmlUrl,
              htmlUrl: item.type === 'rss' ? values.htmlUrl : item.htmlUrl
            };
          } else {
            return {
              ...item,
              children: updateItem(item.children, rest, values)
            };
          }
        }
        return item;
      });
    };

    const pathArray = selectedItem.path.split('-').map(Number);
    const updatedData = updateItem(opmlData, pathArray, editValues);
    
    setOpmlData(updatedData);
    // 更新选中项以反映更改
    setSelectedItem(prev => ({
      ...prev,
      text: editValues.text,
      xmlUrl: editValues.xmlUrl,
      htmlUrl: editValues.htmlUrl
    }));
  };

  // Add new item
  const addItem = (type) => {
    const newItem = {
      text: type === 'folder' ? 'New Folder' : 'New RSS Feed',
      type,
      xmlUrl: type === 'rss' ? 'http://example.com/feed.xml' : null,
      htmlUrl: type === 'rss' ? 'http://example.com' : null,
      children: type === 'folder' ? [] : null
    };

    if (!selectedItem) {
      // 将新文件夹添加到列表顶部，RSS添加到列表末尾
      if (type === 'folder') {
        setOpmlData([newItem, ...(opmlData || [])]);
      } else {
        setOpmlData([...(opmlData || []), newItem]);
      }
    } else {
      const updateItem = (data, pathArray, newItem) => {
        if (pathArray.length === 0) {
          // 将新文件夹添加到列表顶部，RSS添加到列表末尾
          if (type === 'folder') {
            return [newItem, ...data];
          } else {
            return [...data, newItem];
          }
        }
        
        const [current, ...rest] = pathArray;
        return data.map((item, index) => {
          if (index === current) {
            return {
              ...item,
              children: updateItem(item.children || [], rest, newItem)
            };
          }
          return item;
        });
      };

      const pathArray = selectedItem.path.split('-').map(Number);
      const updatedData = updateItem(opmlData, pathArray, newItem);
      setOpmlData(updatedData);
      setExpandedFolders(prev => ({ ...prev, [selectedItem.path]: true }));
    }
  };

  // Delete item
  const deleteItem = () => {
    if (!selectedItem) return;

    const updateData = (data, pathArray) => {
      if (pathArray.length === 0) return data;
      
      const [current, ...rest] = pathArray;
      if (rest.length === 0) {
        return data.filter((_, index) => index !== current);
      } else {
        return data.map((item, index) => {
          if (index === current) {
            return {
              ...item,
              children: updateData(item.children || [], rest)
            };
          }
          return item;
        });
      };
    };

    const pathArray = selectedItem.path.split('-').map(Number);
    const updatedData = updateData(opmlData, pathArray);
    setOpmlData(updatedData);
    setSelectedItem(null);
  };

  // Export OPML file
  const exportOPML = () => {
    if (!opmlData) return;

    const buildOutline = (item) => {
      let outline = `<outline text="${item.text}"`;
      if (item.type === 'rss') {
        outline += ` type="rss" xmlUrl="${item.xmlUrl}" htmlUrl="${item.htmlUrl}"`;
      }
      
      if (item.children?.length) {
        outline += '>';
        item.children.forEach(child => {
          outline += buildOutline(child);
        });
        outline += '</outline>';
      } else {
        outline += '/>';
      }
      
      return outline;
    };

    let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Exported OPML</title>
  </head>
  <body>
    ${opmlData.map(item => buildOutline(item)).join('')}
  </body>
</opml>`;

    const blob = new Blob([opmlContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exported_opml.opml';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 处理拖拽开始事件
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  // 处理拖拽悬停事件，用于自动展开文件夹和支持放置在文件夹内部
  const handleDragOver = (event) => {
    const { active, over } = event;
    
    // 如果没有悬停目标，则不做任何操作
    if (!over) return;
    
    // 获取悬停目标的路径和索引
    const overId = over.id;
    const parts = overId.split('-');
    const index = parseInt(parts.pop(), 10);
    const path = parts.join('-');
    
    // 获取悬停目标项目
    let targetItem = opmlData;
    if (path) {
      const pathArray = path.split('-').map(Number);
      for (let i = 0; i < pathArray.length; i++) {
        targetItem = targetItem[pathArray[i]].children;
      }
    }
    targetItem = targetItem[index];
    
    // 如果悬停目标是文件夹，则自动展开
    if (targetItem.type === 'folder') {
      const targetPath = path ? `${path}-${index}` : `${index}`;
      if (!expandedFolders[targetPath]) {
        setExpandedFolders(prev => ({
          ...prev,
          [targetPath]: true
        }));
      }
      
      // 修改over.id，使其指向文件夹的第一个位置
      // 这样当拖放结束时，项目会被放置在文件夹内部的第一个位置
      if (targetItem.children && targetItem.children.length > 0) {
        // 如果文件夹已有子项，则放在第一个位置
        event.over.id = `${targetPath}-0`;
      } else {
        // 如果文件夹没有子项，创建一个空的子项数组
        targetItem.children = [];
        // 然后放在第一个位置
        event.over.id = `${targetPath}-0`;
      }
    }
  };

  // 处理拖拽结束事件
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    setActiveId(null);
    
    // 如果没有目标位置或者源位置和目标位置相同，则不做任何操作
    if (!over || active.id === over.id) {
      return;
    }
    
    // 解析源ID和目标ID
    const activeId = active.id;
    const overId = over.id;
    
    // 从ID中提取路径和索引
    const getPathAndIndex = (id) => {
      const parts = id.split('-');
      const index = parseInt(parts.pop(), 10);
      const path = parts.join('-');
      return { path, index };
    };
    
    const { path: sourcePath, index: sourceIndex } = getPathAndIndex(activeId);
    const { path: destPath, index: destIndex } = getPathAndIndex(overId);
    
    // 如果源路径和目标路径相同，则是在同一个容器内排序
    if (sourcePath === destPath) {
      // 复制当前数据以进行修改
      const newData = JSON.parse(JSON.stringify(opmlData));
      
      // 获取要操作的数组
      let items = newData;
      if (sourcePath) {
        const pathArray = sourcePath.split('-').map(Number);
        for (let i = 0; i < pathArray.length; i++) {
          items = items[pathArray[i]].children;
        }
      }
      
      // 移动项目
      const [movedItem] = items.splice(sourceIndex, 1);
      items.splice(destIndex, 0, movedItem);
      
      // 对项目进行排序，确保文件夹始终在顶部
      items.sort((a, b) => {
        // 如果a是文件夹而b不是，a应该排在前面
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        // 如果b是文件夹而a不是，b应该排在前面
        if (b.type === 'folder' && a.type !== 'folder') return 1;
        // 如果两者类型相同，保持原有顺序
        return 0;
      });
      
      // 更新数据
      setOpmlData(newData);
      
      // 如果选中的项目被移动，更新选中项的路径
      if (selectedItem && selectedItem.path === activeId) {
        const newPath = destPath ? `${destPath}-${destIndex}` : `${destIndex}`;
        setSelectedItem({
          ...selectedItem,
          path: newPath
        });
      }
    } else {
      // 跨容器拖拽
      // 复制当前数据以进行修改
      const newData = JSON.parse(JSON.stringify(opmlData));
      
      // 获取源项目
      let sourceItems = newData;
      let sourceItem;
      
      if (sourcePath) {
        const sourcePathArray = sourcePath.split('-').map(Number);
        for (let i = 0; i < sourcePathArray.length; i++) {
          sourceItems = sourceItems[sourcePathArray[i]].children;
        }
      }
      
      // 移除源项目
      sourceItem = sourceItems.splice(sourceIndex, 1)[0];
      
      // 获取目标位置并插入项目
      let destItems = newData;
      
      if (destPath) {
        const destPathArray = destPath.split('-').map(Number);
        for (let i = 0; i < destPathArray.length; i++) {
          // 确保目标路径上的每个节点都有children数组
          if (!destItems[destPathArray[i]].children) {
            destItems[destPathArray[i]].children = [];
          }
          destItems = destItems[destPathArray[i]].children;
        }
      }
      
      // 插入到目标位置
      destItems.splice(destIndex, 0, sourceItem);
      
      // 对目标容器中的项目进行排序，确保文件夹始终在顶部
      destItems.sort((a, b) => {
        // 如果a是文件夹而b不是，a应该排在前面
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        // 如果b是文件夹而a不是，b应该排在前面
        if (b.type === 'folder' && a.type !== 'folder') return 1;
        // 如果两者类型相同，保持原有顺序
        return 0;
      });
      
      // 更新数据
      setOpmlData(newData);
      
      // 如果选中的项目被移动，更新选中项的路径
      if (selectedItem && selectedItem.path === activeId) {
        const newPath = destPath ? `${destPath}-${destIndex}` : `${destIndex}`;
        setSelectedItem({
          ...selectedItem,
          path: newPath
        });
      }
    }
  };

  // 可排序项组件
  const SortableItem = ({ item, path, index }) => {
    const currentPath = path ? `${path}-${index}` : `${index}`;
    const isExpanded = expandedFolders[currentPath];
    const isSelected = selectedItem?.path === currentPath;
    const id = currentPath;
    
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id });
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };
    
    return (
      <div ref={setNodeRef} style={style} className={isDragging ? 'z-50' : ''}>
        <div 
          className={`flex items-center p-2 rounded hover:bg-gray-100 ${isSelected ? 'bg-blue-50' : ''}`}
        >
          <div 
            {...attributes}
            {...listeners}
            className="mr-1 text-gray-400 hover:text-gray-600 cursor-grab"
          >
            <GripVertical size={16} />
          </div>
          
          {item.type === 'folder' ? (
            <button 
              className="mr-1 text-gray-500 hover:text-gray-700"
              onClick={(e) => { e.stopPropagation(); toggleFolder(currentPath); }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <div className="w-4 mr-1"></div>
          )}
          
          <div 
            className="flex items-center flex-1"
            onClick={() => handleSelectItem(item, currentPath)}
          >
            {item.type === 'folder' ? (
              <FolderPlus size={16} className="mr-2 text-yellow-500" />
            ) : (
              <Rss size={16} className="mr-2 text-blue-500" />
            )}
            
            <span className="flex-1">
              {item.text}
            </span>
          </div>
        </div>
        
        <AnimatePresence>
          {item.children && isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="ml-4"
            >
              <TreeContainer items={item.children} path={currentPath} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // 树容器组件
  const TreeContainer = ({ items, path = '' }) => {
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    
    // 为SortableContext准备项目ID
    const itemIds = items.map((_, index) => {
      return path ? `${path}-${index}` : `${index}`;
    });
    
    return (
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => (
          <SortableItem 
            key={path ? `${path}-${index}` : `${index}`}
            item={item} 
            path={path} 
            index={index} 
          />
        ))}
      </SortableContext>
    );
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <h1 className="text-2xl font-bold mb-4">OPML File Editor</h1>
      
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left Panel: Tree View */}
        <div className="w-full md:w-1/2 bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Feed Structure</h2>
            
            <div className="flex gap-2">
              <button 
                className="p-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 flex items-center"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileInput size={16} className="mr-1" />
                <span>Import</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileImport}
                accept=".opml,.xml"
                className="hidden"
              />
              
              <button 
                className="p-2 bg-green-50 text-green-600 rounded hover:bg-green-100 flex items-center"
                onClick={exportOPML}
                disabled={!opmlData}
              >
                <Download size={16} className="mr-1" />
                <span>Export</span>
              </button>
            </div>
          </div>
          
          {opmlData ? (
            <div className="border rounded p-2 min-h-[300px]">
              {/* 使用DndContext替代DragDropContext */}
              {Array.isArray(opmlData) && opmlData.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <TreeContainer items={opmlData} />
                  <DragOverlay>
                    {activeId ? (
                      <div className="p-2 bg-white border rounded shadow-lg">
                        {(() => {
                          // 从activeId中获取项目
                          const pathArray = activeId.split('-').map(Number);
                          let item = opmlData;
                          for (let i = 0; i < pathArray.length; i++) {
                            if (i === pathArray.length - 1) {
                              item = item[pathArray[i]];
                            } else {
                              item = item[pathArray[i]].children;
                            }
                          }
                          return (
                            <div className="flex items-center">
                              {item.type === 'folder' ? (
                                <FolderPlus size={16} className="mr-2 text-yellow-500" />
                              ) : (
                                <Rss size={16} className="mr-2 text-blue-500" />
                              )}
                              <span>{item.text}</span>
                            </div>
                          );
                        })()} 
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              ) : (
                <div className="text-center p-4 text-gray-500">
                  <p>导入的OPML文件没有有效的数据</p>
                </div>
              )}
            </div>
          ) : (
            <div className="border rounded p-4 text-center text-gray-500 min-h-[300px] flex items-center justify-center">
              <div>
                <p className="mb-2">No OPML data loaded</p>
                <p className="text-sm">Import an OPML file to start editing</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Right Panel: Actions & Details */}
        <div className="w-full md:w-1/2 bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Actions</h2>
          
          <div className="flex gap-2 mb-4">
            <button 
              className="p-2 bg-yellow-50 text-yellow-600 rounded hover:bg-yellow-100 flex items-center"
              onClick={() => addItem('folder')}
            >
              <FolderPlus size={16} className="mr-1" />
              <span>Add Folder</span>
            </button>
            
            <button 
              className="p-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 flex items-center"
              onClick={() => addItem('rss')}
            >
              <FilePlus size={16} className="mr-1" />
              <span>Add RSS</span>
            </button>
            
            <button 
              className="p-2 bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center"
              onClick={deleteItem}
              disabled={!selectedItem}
            >
              <Trash2 size={16} className="mr-1" />
              <span>Delete</span>
            </button>
          </div>
          
          {selectedItem && (
            <div className="border rounded p-4">
              <h3 className="font-medium mb-2">Edit Item</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <div className="flex items-center">
                  {selectedItem.type === 'folder' ? (
                    <FolderPlus size={16} className="mr-2 text-yellow-500" />
                  ) : (
                    <Rss size={16} className="mr-2 text-blue-500" />
                  )}
                  <input 
                    type="text" 
                    value={editValues.text} 
                    onChange={(e) => handleEditChange('text', e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                </div>
              </div>
              
              {selectedItem.type === 'rss' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      XML URL
                    </label>
                    <input 
                      type="text" 
                      value={editValues.xmlUrl} 
                      onChange={(e) => handleEditChange('xmlUrl', e.target.value)}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      HTML URL
                    </label>
                    <input 
                      type="text" 
                      value={editValues.htmlUrl} 
                      onChange={(e) => handleEditChange('htmlUrl', e.target.value)}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                </>
              )}
              
              <button 
                className="p-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 w-full"
                onClick={saveEdit}
              >
                Save Changes
              </button>
            </div>
          )}
          
          {!selectedItem && (
            <div className="border rounded p-4 text-center text-gray-500 min-h-[200px] flex items-center justify-center">
              <p>Select an item to edit details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OPMLTool;