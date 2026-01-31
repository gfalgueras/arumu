<script setup lang="ts">
import { ref, watch, shallowRef, computed, onUnmounted } from 'vue';
import { Loader2, Key, List, Link, Columns, Copy, Check, Plus, X, GripHorizontal, Trash2, AlertCircle, Save, ArrowUp, ArrowDown } from 'lucide-vue-next';
import type { ColumnInfo, TableIndex, ForeignKey, TypeGroup } from '@shared/types/database';
import MultiSelect from './MultiSelect.vue';
import CodeModal from './CodeModal.vue';
import { showError } from '../errorService';

const props = defineProps<{
  serverName: string;
  database: string;
  table: string;
}>();

const vFocus = {
  mounted: (el: HTMLElement) => el.focus()
};

const height = defineModel<number>('height', { default: 400 });

const columns = shallowRef<ColumnInfo[]>([]);
const originalColumns = shallowRef<ColumnInfo[]>([]);
const indexes = shallowRef<TableIndex[]>([]);
const originalIndexes = shallowRef<TableIndex[]>([]);
const foreignKeys = shallowRef<ForeignKey[]>([]);
const originalFKs = shallowRef<ForeignKey[]>([]);
const createStatement = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const bottomTab = ref<'indexes' | 'fks'>('indexes');
const copied = ref(false);
const copiedAlter = ref(false);

const showCodeModal = ref(false);
const codeModalTitle = ref('');
const codeModalContent = ref('');

const showAddIndex = ref(false);
const showAddFK = ref(false);
const saving = ref(false);
const isResizing = ref(false);

// State for inline editing
const editingIndex = ref<TableIndex | null>(null);
const editingIndexField = ref<string | null>(null);
const originalIndexName = ref<string>('');

const editingFK = ref<ForeignKey | null>(null);
const editingFKField = ref<string | null>(null);
const originalFKName = ref<string>('');

const editingColumn = ref<ColumnInfo | null>(null);
const editingColumnField = ref<string | null>(null);
const editingColumnId = ref<string | null>(null);
const selectedColumnIndex = ref<number | null>(null);

const containerRef = ref<HTMLElement | null>(null);

const startResizing = (e: MouseEvent) => {
  e.preventDefault();
  isResizing.value = true;
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value || !containerRef.value) return;
  
  const rect = containerRef.value.getBoundingClientRect();
  const newHeight = e.clientY - rect.top;
  
  // Limitar la altura mínima y máxima razonable
  if (newHeight > 150 && newHeight < window.innerHeight - 300) {
    height.value = newHeight;
  }
};

const handleMouseUp = () => {
  isResizing.value = false;
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
};

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
});

const newIndex = ref<TableIndex>({
  name: '',
  columns: [],
  unique: false,
  type: 'INDEX'
});

const newFK = ref<ForeignKey>({
  name: '',
  columns: [],
  referencedTable: '',
  referencedColumns: [],
  updateRule: 'CASCADE',
  deleteRule: 'RESTRICT'
});

const allDatabaseSchema = ref<Record<string, string[]>>({});
const supportedTypes = ref<TypeGroup[]>([]);

const hasPendingChanges = computed(() => {
  return JSON.stringify(columns.value) !== JSON.stringify(originalColumns.value) ||
         JSON.stringify(indexes.value) !== JSON.stringify(originalIndexes.value) ||
         JSON.stringify(foreignKeys.value) !== JSON.stringify(originalFKs.value);
});

const availableTables = computed(() => Object.keys(allDatabaseSchema.value).sort());
const columnNames = computed(() => columns.value.map(c => c.name));

const sortedIndexes = computed(() => {
  const order = ['PRIMARY', 'UNIQUE', 'INDEX', 'FULLTEXT', 'SPATIAL'];
  return [...indexes.value].sort((a, b) => {
    const typeA = a.type.toUpperCase();
    const typeB = b.type.toUpperCase();
    
    if (typeA !== typeB) {
      const indexA = order.indexOf(typeA);
      const indexB = order.indexOf(typeB);
      
      const sortA = indexA === -1 ? 999 : indexA;
      const sortB = indexB === -1 ? 999 : indexB;
      
      if (sortA !== sortB) return sortA - sortB;
    }
    
    return a.name.localeCompare(b.name);
  });
});

const getReferencedTableColumns = (tableName: string) => allDatabaseSchema.value[tableName] || [];

const getPendingChanges = () => {
  const colChanges = columns.value.map(curr => {
    const origIdx = originalColumns.value.findIndex(o => o._id === curr._id);
    if (origIdx === -1) return null;
    
    const orig = originalColumns.value[origIdx];
    const currIdx = columns.value.indexOf(curr);
    
    const propertiesChanged = JSON.stringify(curr) !== JSON.stringify(orig);
    
    // Position change: predecessor changed or was first and isn't now, or vice versa
    const currPrevId = currIdx > 0 ? columns.value[currIdx - 1]._id : null;
    const origPrevId = origIdx > 0 ? originalColumns.value[origIdx - 1]._id : null;
    const positionChanged = currPrevId !== origPrevId;

    if (propertiesChanged || positionChanged) {
      const afterColumn = currIdx > 0 ? columns.value[currIdx - 1].name : '';
      return { oldName: orig.name, newCol: curr, afterColumn };
    }
    return null;
  }).filter(Boolean) as { oldName: string, newCol: ColumnInfo, afterColumn?: string }[];

  const columnsToAdd = columns.value.filter(curr => {
    return !originalColumns.value.some(o => o._id === curr._id);
  }).map(curr => {
    const idx = columns.value.indexOf(curr);
    const afterColumn = idx > 0 ? columns.value[idx - 1].name : '';
    return { col: curr, afterColumn };
  });

  const indexesToDrop = originalIndexes.value.filter(orig => {
    const current = indexes.value.find(curr => curr.name === orig.name);
    return !current || JSON.stringify(current) !== JSON.stringify(orig);
  });

  const indexesToAdd = indexes.value.filter(curr => {
    const orig = originalIndexes.value.find(o => o.name === curr.name);
    return !orig || JSON.stringify(orig) !== JSON.stringify(curr);
  });

  const fksToDrop = originalFKs.value.filter(orig => {
    const current = foreignKeys.value.find(curr => curr.name === orig.name);
    return !current || JSON.stringify(current) !== JSON.stringify(orig);
  });

  const fksToAdd = foreignKeys.value.filter(curr => {
    const orig = originalFKs.value.find(o => o.name === curr.name);
    return !orig || JSON.stringify(orig) !== JSON.stringify(curr);
  });

  return { columnsToUpdate: colChanges, columnsToAdd, indexesToDrop, indexesToAdd, fksToDrop, fksToAdd };
};

const fetchSupportedTypes = async () => {
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/types`);
    if (res.ok) {
      supportedTypes.value = await res.json();
    }
  } catch (err) {
    console.error('Error fetching supported types:', err);
  }
};

const fetchSchemaData = async () => {
  loading.value = true;
  error.value = null;
  createStatement.value = null;
  try {
    const [colsRes, idxRes, fksRes, createRes, schemaRes] = await Promise.all([
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/schema`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/indexes`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/foreign-keys`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/create-statement`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/schema`)
    ]);

    if (!colsRes.ok || !idxRes.ok || !fksRes.ok || !createRes.ok || !schemaRes.ok) {
      throw new Error('Failed to fetch table structure');
    }

    const [colsData, idxData, fksData, createData, schemaData] = await Promise.all([
      colsRes.json(),
      idxRes.json(),
      fksRes.json(),
      createRes.json(),
      schemaRes.json()
    ]);

    const colsWithId = colsData.map((c: ColumnInfo) => ({ 
      ...c, 
      _id: c._id || Math.random().toString(36).substr(2, 9) 
    }));
    columns.value = colsWithId;
    originalColumns.value = JSON.parse(JSON.stringify(colsWithId));
    indexes.value = idxData;
    originalIndexes.value = JSON.parse(JSON.stringify(idxData));
    foreignKeys.value = fksData;
    originalFKs.value = JSON.parse(JSON.stringify(fksData));
    createStatement.value = createData.statement;
    allDatabaseSchema.value = schemaData;
  } catch (err: any) {
    error.value = err.message;
    showError('Error al cargar estructura de tabla', err.message);
  } finally {
    loading.value = false;
  }
};

const handleAddColumn = () => {
  const newCol: ColumnInfo = {
    _id: Math.random().toString(36).substr(2, 9),
    name: `new_column_${columns.value.length + 1}`,
    type: 'INT',
    nullable: true,
    default: null,
    extra: '',
    comment: ''
  };

  const newColumns = [...columns.value];
  let insertIndex = newColumns.length;
  
  if (selectedColumnIndex.value !== null) {
    insertIndex = selectedColumnIndex.value + 1;
  }
  
  newColumns.splice(insertIndex, 0, newCol);
  columns.value = newColumns;
  selectedColumnIndex.value = insertIndex;
};

const moveColumnUp = () => {
  if (selectedColumnIndex.value === null || selectedColumnIndex.value === 0) return;
  
  const newColumns = [...columns.value];
  const index = selectedColumnIndex.value;
  const temp = newColumns[index];
  newColumns[index] = newColumns[index - 1];
  newColumns[index - 1] = temp;
  
  columns.value = newColumns;
  selectedColumnIndex.value = index - 1;
};

const moveColumnDown = () => {
  if (selectedColumnIndex.value === null || selectedColumnIndex.value === columns.value.length - 1) return;
  
  const newColumns = [...columns.value];
  const index = selectedColumnIndex.value;
  const temp = newColumns[index];
  newColumns[index] = newColumns[index + 1];
  newColumns[index + 1] = temp;
  
  columns.value = newColumns;
  selectedColumnIndex.value = index + 1;
};

const toggleColumnSelection = (index: number) => {
  if (selectedColumnIndex.value === index) {
    selectedColumnIndex.value = null;
  } else {
    selectedColumnIndex.value = index;
  }
};

const handleAddIndex = () => {
  if (newIndex.value.columns.length === 0) return;
  indexes.value = [...indexes.value, JSON.parse(JSON.stringify(newIndex.value))];
  showAddIndex.value = false;
};

const handleAddFK = () => {
  if (newFK.value.columns.length === 0 || !newFK.value.referencedTable || newFK.value.referencedColumns.length === 0) return;
  foreignKeys.value = [...foreignKeys.value, JSON.parse(JSON.stringify(newFK.value))];
  showAddFK.value = false;
};

const startEditIndex = (idx: TableIndex, field: string) => {
  if (editingIndex.value) saveIndexEdit();
  editingIndex.value = JSON.parse(JSON.stringify(idx));
  originalIndexName.value = idx.name;
  editingIndexField.value = field;
};

const cancelEditIndex = () => {
  editingIndex.value = null;
  editingIndexField.value = null;
};

const saveIndexEdit = () => {
  if (!editingIndex.value) return;
  
  const current = indexes.value.find(i => i.name === originalIndexName.value);
  if (current && JSON.stringify(current) === JSON.stringify(editingIndex.value)) {
    cancelEditIndex();
    return;
  }

  const newIndexes = [...indexes.value];
  const idx = newIndexes.findIndex(i => i.name === originalIndexName.value);
  if (idx !== -1) {
    newIndexes[idx] = JSON.parse(JSON.stringify(editingIndex.value));
    indexes.value = newIndexes;
  }

  cancelEditIndex();
};

const startEditFK = (fk: ForeignKey, field: string) => {
  if (editingFK.value) saveFKEdit();
  editingFK.value = JSON.parse(JSON.stringify(fk));
  originalFKName.value = fk.name;
  editingFKField.value = field;
};

const cancelEditFK = () => {
  editingFK.value = null;
  editingFKField.value = null;
};

const saveFKEdit = () => {
  if (!editingFK.value) return;

  const current = foreignKeys.value.find(f => f.name === originalFKName.value);
  if (current && JSON.stringify(current) === JSON.stringify(editingFK.value)) {
    cancelEditFK();
    return;
  }

  const newFKs = [...foreignKeys.value];
  const idx = newFKs.findIndex(f => f.name === originalFKName.value);
  if (idx !== -1) {
    newFKs[idx] = JSON.parse(JSON.stringify(editingFK.value));
    foreignKeys.value = newFKs;
  }

  cancelEditFK();
};

const startEditColumn = (col: ColumnInfo, field: string) => {
  if (editingColumn.value) saveColumnEdit();
  editingColumn.value = JSON.parse(JSON.stringify(col));
  editingColumnId.value = col._id!;
  editingColumnField.value = field;
};

const cancelEditColumn = () => {
  editingColumn.value = null;
  editingColumnField.value = null;
  editingColumnId.value = null;
};

const saveColumnEdit = () => {
  if (!editingColumn.value) return;

  const colIdx = columns.value.findIndex(c => c._id === editingColumnId.value);
  if (colIdx === -1) {
    cancelEditColumn();
    return;
  }

  // Reset unsigned if the type doesn't support it
  if (!supportsUnsigned(editingColumn.value.type)) {
    editingColumn.value.unsigned = false;
  }

  const current = columns.value[colIdx];
  if (JSON.stringify(current) === JSON.stringify(editingColumn.value)) {
    cancelEditColumn();
    return;
  }

  const newColumns = [...columns.value];
  newColumns[colIdx] = JSON.parse(JSON.stringify(editingColumn.value));
  columns.value = newColumns;

  cancelEditColumn();
};

const handleDiscard = () => {
  columns.value = JSON.parse(JSON.stringify(originalColumns.value));
  indexes.value = JSON.parse(JSON.stringify(originalIndexes.value));
  foreignKeys.value = JSON.parse(JSON.stringify(originalFKs.value));
  selectedColumnIndex.value = null;
  showAddIndex.value = false;
  showAddFK.value = false;
};

const handleCommit = async () => {
  if (editingIndex.value) saveIndexEdit();
  if (editingFK.value) saveFKEdit();
  if (editingColumn.value) saveColumnEdit();
  saving.value = true;
  try {
    const { columnsToUpdate, columnsToAdd, indexesToDrop, indexesToAdd, fksToDrop, fksToAdd } = getPendingChanges();

    const baseUrl = `http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}`;

    // DROPs first (to avoid conflicts if re-adding indices/fks with same name)
    for (const fk of fksToDrop) {
       await fetch(`${baseUrl}/foreign-keys/${encodeURIComponent(fk.name)}`, { method: 'DELETE' });
    }
    for (const idx of indexesToDrop) {
       await fetch(`${baseUrl}/indexes/${encodeURIComponent(idx.name)}`, { method: 'DELETE' });
    }

    // Column updates
    for (const { oldName, newCol, afterColumn } of columnsToUpdate) {
      const res = await fetch(`${baseUrl}/columns/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: newCol, afterColumn })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Error al actualizar columna ${oldName}: ${err.error || 'Desconocido'}`);
      }
    }

    // New columns
    for (const { col, afterColumn } of columnsToAdd) {
      const res = await fetch(`${baseUrl}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: col, afterColumn })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Error al añadir columna ${col.name}: ${err.error || 'Desconocido'}`);
      }
    }

    // ADDs
    for (const idx of indexesToAdd) {
       const res = await fetch(`${baseUrl}/indexes`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(idx)
       });
       if (!res.ok) {
         const err = await res.json();
         throw new Error(`Error al añadir índice: ${err.error || 'Desconocido'}`);
       }
    }
    for (const fk of fksToAdd) {
       const res = await fetch(`${baseUrl}/foreign-keys`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(fk)
       });
       if (!res.ok) {
         const err = await res.json();
         throw new Error(`Error al añadir FK: ${err.error || 'Desconocido'}`);
       }
    }

    await fetchSchemaData();
  } catch (err: any) {
    showError('Error al guardar cambios', err.message);
  } finally {
    saving.value = false;
  }
};

const deleteIndex = (idx: TableIndex) => {
  indexes.value = indexes.value.filter(i => i !== idx);
};

const deleteFK = (fk: ForeignKey) => {
  foreignKeys.value = foreignKeys.value.filter(f => f !== fk);
};

const handleCopyCreate = async () => {
  if (!createStatement.value) return;
  
  try {
    await navigator.clipboard.writeText(createStatement.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const getAlterSql = () => {
  const { columnsToUpdate, columnsToAdd, indexesToDrop, indexesToAdd, fksToDrop, fksToAdd } = getPendingChanges();
  
  const escapedDb = props.database.replace(/`/g, '``');
  const escapedTable = props.table.replace(/`/g, '``');
  const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;

  const parts: string[] = [];

  // Update Columns
  for (const { oldName, newCol, afterColumn } of columnsToUpdate) {
    let columnType = newCol.type;
    if (newCol.length) {
      columnType += `(${newCol.length})`;
    }
    let sql = `CHANGE COLUMN \`${oldName.replace(/`/g, '``')}\` \`${newCol.name.replace(/`/g, '``')}\` ${columnType}`;
    if (newCol.unsigned) sql += ' UNSIGNED';
    if (!newCol.nullable) sql += ' NOT NULL';
    else sql += ' NULL';
    
    if (newCol.default !== undefined) {
      if (newCol.default === null) sql += ' DEFAULT NULL';
      else if (newCol.default.toUpperCase() === 'CURRENT_TIMESTAMP') sql += ' DEFAULT CURRENT_TIMESTAMP';
      else sql += ` DEFAULT '${newCol.default.replace(/'/g, "''")}'`;
    }
    
    if (newCol.extra) sql += ` ${newCol.extra}`;
    if (newCol.comment) sql += ` COMMENT '${newCol.comment.replace(/'/g, "''")}'`;
    
    if (afterColumn !== undefined) {
      if (afterColumn === '') sql += ' FIRST';
      else sql += ` AFTER \`${afterColumn.replace(/`/g, '``')}\``;
    }
    
    parts.push(sql);
  }

  // New Columns
  for (const { col, afterColumn } of columnsToAdd) {
    let columnType = col.type;
    if (col.length) {
      columnType += `(${col.length})`;
    }
    let sql = `ADD COLUMN \`${col.name.replace(/`/g, '``')}\` ${columnType}`;
    if (col.unsigned) sql += ' UNSIGNED';
    if (!col.nullable) sql += ' NOT NULL';
    else sql += ' NULL';
    
    if (col.default !== undefined) {
      if (col.default === null) sql += ' DEFAULT NULL';
      else if (col.default.toUpperCase() === 'CURRENT_TIMESTAMP') sql += ' DEFAULT CURRENT_TIMESTAMP';
      else sql += ` DEFAULT '${col.default.replace(/'/g, "''")}'`;
    }
    
    if (col.extra) sql += ` ${col.extra}`;
    if (col.comment) sql += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
    
    if (afterColumn !== undefined) {
      if (afterColumn === '') sql += ' FIRST';
      else sql += ` AFTER \`${afterColumn.replace(/`/g, '``')}\``;
    }
    
    parts.push(sql);
  }

  // DROPs
  for (const fk of fksToDrop) {
    parts.push(`DROP FOREIGN KEY \`${fk.name.replace(/`/g, '``')}\``);
  }
  for (const idx of indexesToDrop) {
    if (idx.name === 'PRIMARY') {
      parts.push(`DROP PRIMARY KEY`);
    } else {
      parts.push(`DROP INDEX \`${idx.name.replace(/`/g, '``')}\``);
    }
  }

  // ADDs
  for (const idx of indexesToAdd) {
    const cols = idx.columns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
    if (idx.type === 'PRIMARY') {
      parts.push(`ADD PRIMARY KEY (${cols})`);
    } else {
      let type = 'INDEX';
      if (idx.type === 'UNIQUE') type = 'UNIQUE INDEX';
      else if (idx.type === 'FULLTEXT') type = 'FULLTEXT INDEX';
      else if (idx.type === 'SPATIAL') type = 'SPATIAL INDEX';
      
      const name = idx.name ? `\`${idx.name.replace(/`/g, '``')}\`` : '';
      parts.push(`ADD ${type} ${name} (${cols})`);
    }
  }

  for (const fk of fksToAdd) {
    const cols = fk.columns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
    const refTable = `\`${escapedDb}\`.\`${fk.referencedTable.replace(/`/g, '``')}\``;
    const refCols = fk.referencedColumns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
    const name = fk.name ? `CONSTRAINT \`${fk.name.replace(/`/g, '``')}\`` : '';
    
    let sql = `ADD ${name} FOREIGN KEY (${cols}) REFERENCES ${refTable} (${refCols})`;
    if (fk.updateRule) sql += ` ON UPDATE ${fk.updateRule}`;
    if (fk.deleteRule) sql += ` ON DELETE ${fk.deleteRule}`;
    parts.push(sql);
  }

  if (parts.length === 0) return null;

  return `ALTER TABLE ${fullTableName}\n  ${parts.join(',\n  ')};`;
};

const handleCopyAlter = async () => {
  const alterSql = getAlterSql();
  if (!alterSql) return;

  try {
    await navigator.clipboard.writeText(alterSql);
    copiedAlter.value = true;
    setTimeout(() => {
      copiedAlter.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const openCreateModal = () => {
  if (!createStatement.value) return;
  codeModalTitle.value = 'CREATE TABLE Statement';
  codeModalContent.value = createStatement.value;
  showCodeModal.value = true;
};

const openAlterModal = () => {
  const sql = getAlterSql();
  if (!sql) return;
  codeModalTitle.value = 'ALTER TABLE Statement';
  codeModalContent.value = sql;
  showCodeModal.value = true;
};

watch(() => newIndex.value.type, (newType) => {
  newIndex.value.unique = (newType === 'UNIQUE' || newType === 'PRIMARY');
});

watch(showAddIndex, (val) => {
  if (!val) {
    newIndex.value = { name: '', columns: [], unique: false, type: 'INDEX' };
  }
});

watch(showAddFK, (val) => {
  if (!val) {
    newFK.value = { name: '', columns: [], referencedTable: '', referencedColumns: [], updateRule: 'CASCADE', deleteRule: 'RESTRICT' };
  }
});

watch(() => [props.serverName, props.database, props.table], () => {
  showAddIndex.value = false;
  showAddFK.value = false;
  selectedColumnIndex.value = null;
  fetchSchemaData();
  fetchSupportedTypes();
}, { immediate: true });

// Helper functions for highlighting changes
const isIndexNew = (idx: TableIndex) => {
  return !originalIndexes.value.some(o => o.name === idx.name);
};

const isIndexModified = (idx: TableIndex) => {
  const orig = originalIndexes.value.find(o => o.name === idx.name);
  if (!orig) return false;
  return JSON.stringify(idx) !== JSON.stringify(orig);
};

const isIndexFieldModified = (idx: TableIndex, field: keyof TableIndex) => {
  const orig = originalIndexes.value.find(o => o.name === idx.name);
  if (!orig) return false;
  return JSON.stringify(idx[field]) !== JSON.stringify(orig[field]);
};

const isFKNew = (fk: ForeignKey) => {
  return !originalFKs.value.some(o => o.name === fk.name);
};

const isFKModified = (fk: ForeignKey) => {
  const orig = originalFKs.value.find(o => o.name === fk.name);
  if (!orig) return false;
  return JSON.stringify(fk) !== JSON.stringify(orig);
};

const isFKFieldModified = (fk: ForeignKey, field: keyof ForeignKey) => {
  const orig = originalFKs.value.find(o => o.name === fk.name);
  if (!orig) return false;
  return JSON.stringify(fk[field]) !== JSON.stringify(orig[field]);
};

const isColumnNew = (col: ColumnInfo) => {
  return !originalColumns.value.some(o => o._id === col._id);
};

const isColumnModified = (col: ColumnInfo) => {
  const currIdx = columns.value.indexOf(col);
  const origIdx = originalColumns.value.findIndex(o => o._id === col._id);
  if (origIdx === -1) return false;

  const orig = originalColumns.value[origIdx];
  const propertiesChanged = JSON.stringify(col) !== JSON.stringify(orig);

  const currPrevId = currIdx > 0 ? columns.value[currIdx - 1]._id : null;
  const origPrevId = origIdx > 0 ? originalColumns.value[origIdx - 1]._id : null;
  const positionChanged = currPrevId !== origPrevId;

  return propertiesChanged || positionChanged;
};

const isColumnFieldModified = (col: ColumnInfo, field: keyof ColumnInfo) => {
  const orig = originalColumns.value.find(o => o._id === col._id);
  if (!orig) return false;
  return JSON.stringify(col[field]) !== JSON.stringify(orig[field]);
};

const getTypeColorClass = (type: string) => {
  const upperType = type.toUpperCase();
  const group = supportedTypes.value.find(g => g.types.includes(upperType))?.group;
  
  switch (group) {
    case 'Entero': return 'text-blue-400';
    case 'Real': return 'text-amber-400';
    case 'Texto': return 'text-emerald-400';
    case 'Binario': return 'text-purple-400';
    case 'Tiempo': return 'text-red-400';
    case 'Geometria': return 'text-indigo-400';
    case 'Otros': return 'text-slate-400';
    default: return 'text-blue-400';
  }
};

const supportsUnsigned = (type: string) => {
  const upperType = type.toUpperCase();
  const group = supportedTypes.value.find(g => g.types.includes(upperType))?.group;
  return group === 'Entero' || group === 'Real';
};
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 w-full gap-4 overflow-hidden">
    <div v-if="loading && columns.length === 0" class="flex-1 flex items-center justify-center bg-slate-900 rounded-lg border border-slate-800">
      <Loader2 class="animate-spin text-blue-500" :size="48" />
    </div>

    <div v-else-if="error" class="flex-1 flex items-center justify-center text-red-400 bg-slate-900 rounded-lg border border-slate-800 p-8">
      <div class="text-center">
        <p class="text-xl font-bold mb-2">Error</p>
        <p>{{ error }}</p>
      </div>
    </div>

    <template v-else>
      <div class="flex-1 flex flex-col min-h-0" ref="containerRef" :class="isResizing ? 'cursor-row-resize select-none' : ''">
        <!-- Top Block: Columns -->
        <div :style="{ height: height + 'px' }" class="flex-shrink-0 flex flex-col min-h-[150px] bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
          <div class="px-4 py-2 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between">
             <div class="flex items-center gap-2">
               <Columns :size="16" class="text-blue-400" />
               <span class="text-sm font-semibold text-slate-300">Columns</span>
             </div>
             <div class="flex items-center gap-2">
               <button 
                 @click="handleAddColumn"
                 class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors rounded text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                 title="Add New Column"
               >
                 <Plus :size="14" />
                 Add Column
               </button>
               <div class="w-px h-4 bg-slate-700 mx-1"></div>
               <button 
                 @click="moveColumnUp"
                 :disabled="selectedColumnIndex === null || selectedColumnIndex === 0"
                 class="p-1 text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
                 title="Move Up"
               >
                 <ArrowUp :size="14" />
               </button>
               <button 
                 @click="moveColumnDown"
                 :disabled="selectedColumnIndex === null || selectedColumnIndex === columns.length - 1"
                 class="p-1 text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
                 title="Move Down"
               >
                 <ArrowDown :size="14" />
               </button>
               <div class="w-px h-4 bg-slate-700 mx-1"></div>
              <div v-if="createStatement" class="flex items-center rounded overflow-hidden border border-emerald-400/20 bg-emerald-400/5">
                <button 
                  @click="openCreateModal"
                  class="px-2.5 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-400/10 transition-colors whitespace-nowrap"
                  title="View CREATE TABLE SQL"
                >
                  Copy CREATE
                </button>
                <div class="w-px h-3 bg-emerald-400/20"></div>
                <button 
                  @click="handleCopyCreate"
                  class="p-1 text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                  title="Copy CREATE TABLE to clipboard"
                >
                  <Check v-if="copied" :size="14" />
                  <Copy v-else :size="14" />
                </button>
              </div>
              <div class="flex items-center rounded overflow-hidden border transition-colors"
                :class="hasPendingChanges ? 'border-amber-400/20 bg-amber-400/5' : 'border-slate-700 bg-slate-800/50'"
              >
                <button 
                  @click="openAlterModal"
                  class="px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap"
                  :class="hasPendingChanges ? 'text-amber-400 hover:bg-amber-400/10' : 'text-slate-400 hover:bg-slate-700'"
                  title="View ALTER TABLE SQL"
                >
                  Copy ALTER
                </button>
                <div class="w-px h-3" :class="hasPendingChanges ? 'bg-amber-400/20' : 'bg-slate-700'"></div>
                <button 
                  @click="handleCopyAlter"
                  class="p-1 transition-colors"
                  :class="[
                    copiedAlter ? 'text-emerald-400' : (hasPendingChanges ? 'text-amber-400 hover:bg-amber-400/10' : 'text-slate-400 hover:bg-slate-700')
                  ]"
                  title="Copy ALTER TABLE to clipboard"
                >
                  <Check v-if="copiedAlter" :size="14" />
                  <Copy v-else :size="14" />
                </button>
              </div>
             </div>
          </div>

          <!-- Pending Changes Bar -->
          <div v-if="hasPendingChanges" class="px-4 py-2 bg-blue-500/10 border-b border-slate-800 flex items-center justify-between flex-shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
            <div class="flex items-center gap-2 text-blue-400 text-xs font-medium">
              <AlertCircle :size="14" />
              <span>Tienes cambios pendientes en el esquema</span>
            </div>
            <div class="flex gap-2">
              <button 
                @click="handleDiscard"
                :disabled="saving"
                class="px-3 py-1 text-xs font-medium text-slate-400 hover:text-slate-100 transition-colors"
              >
                Descartar
              </button>
              <button 
                @click="handleCommit"
                :disabled="saving"
                class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:bg-slate-700 shadow-lg shadow-blue-500/20"
              >
                <Loader2 v-if="saving" :size="12" class="animate-spin" />
                <Save v-else :size="12" />
                Guardar cambios
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <table class="w-full text-left border-collapse table-auto">
              <thead class="sticky top-0 z-10 bg-slate-800 shadow-sm">
                <tr>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Name</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Type</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Length</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700 text-center">Signed/Unsigned</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700 text-center">Nullable</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700 text-center">Key</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Default</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Collation</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Expression</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Virtuality</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Extra</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Comment</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(col, idx) in columns" :key="col._id || col.name" @click="toggleColumnSelection(idx)" class="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0 transition-colors cursor-pointer" :class="{ 'bg-amber-500/5 border-l-2 border-amber-500/50': isColumnModified(col), 'bg-emerald-500/5 border-l-2 border-emerald-500/50': isColumnNew(col), 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/30': selectedColumnIndex === idx }">
                  <td class="px-4 py-2 text-sm font-medium text-slate-100 flex items-center gap-2 cursor-pointer" @dblclick="startEditColumn(col, 'name')" :class="{ 'text-amber-400': isColumnFieldModified(col, 'name') }">
                    <template v-if="editingColumn && editingColumnId === col._id && editingColumnField === 'name'">
                      <input 
                        v-model="editingColumn.name" 
                        @blur="saveColumnEdit" 
                        @keyup.enter="saveColumnEdit"
                        @keyup.escape="cancelEditColumn"
                        v-focus
                        @click.stop
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm"
                      />
                    </template>
                    <template v-else>
                      <Key v-if="col.key === 'PRI'" :size="12" class="text-yellow-500" title="Primary Key" />
                      <Key v-else-if="col.key" :size="12" class="text-slate-500" :title="col.key === 'UNI' ? 'Unique Key' : col.key === 'MUL' ? 'Multiple Key (Index)' : 'Index'" />
                      {{ col.name }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm font-mono cursor-pointer" @dblclick="startEditColumn(col, 'type')" :class="[isColumnFieldModified(col, 'type') ? 'text-amber-400' : getTypeColorClass(col.type)]">
                    <template v-if="editingColumn && editingColumnId === col._id && editingColumnField === 'type'">
                      <select 
                        v-model="editingColumn.type" 
                        @change="saveColumnEdit"
                        @blur="saveColumnEdit"
                        @keyup.escape="cancelEditColumn"
                        v-focus
                        @click.stop
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm font-mono"
                        :class="getTypeColorClass(editingColumn.type)"
                      >
                        <option v-if="editingColumn?.type && !supportedTypes.some(g => g.types.includes(editingColumn!.type.toUpperCase()))" :value="editingColumn.type">
                          {{ editingColumn!.type.toUpperCase() }}
                        </option>
                        <optgroup v-for="group in supportedTypes" :key="group.group" :label="group.group" class="text-slate-400 bg-slate-900">
                          <option v-for="type in group.types" :key="type" :value="type" :class="getTypeColorClass(type)">{{ type }}</option>
                        </optgroup>
                      </select>
                    </template>
                    <template v-else>
                      {{ col.type.toUpperCase() }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm font-mono text-slate-400 cursor-pointer" @dblclick="startEditColumn(col, 'length')" :class="{ 'text-amber-400': isColumnFieldModified(col, 'length') }">
                    <template v-if="editingColumn && editingColumnId === col._id && editingColumnField === 'length'">
                      <input 
                        v-model="editingColumn.length" 
                        @blur="saveColumnEdit" 
                        @keyup.enter="saveColumnEdit"
                        @keyup.escape="cancelEditColumn"
                        v-focus
                        @click.stop
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm font-mono"
                        placeholder="Length..."
                      />
                    </template>
                    <template v-else>
                      {{ col.length }}
                    </template>
                  </td>
                  <td 
                    class="px-4 py-2 text-sm text-center" 
                    :class="[
                      supportsUnsigned(col.type) ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
                      { 'text-amber-400': isColumnFieldModified(col, 'unsigned') }
                    ]"
                    @dblclick="supportsUnsigned(col.type) && startEditColumn(col, 'unsigned')"
                  >
                    <template v-if="editingColumn && editingColumnId === col._id && editingColumnField === 'unsigned'">
                      <select 
                        v-model="editingColumn.unsigned" 
                        @change="saveColumnEdit"
                        @blur="saveColumnEdit"
                        v-focus
                        @click.stop
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm text-slate-200"
                      >
                        <option :value="true">UNSIGNED</option>
                        <option :value="false">SIGNED</option>
                      </select>
                    </template>
                    <template v-else>
                      <template v-if="supportsUnsigned(col.type)">
                        <span v-if="col.unsigned" class="text-blue-400 text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-400/10">UNSIGNED</span>
                        <span v-else class="text-slate-500 text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-500/10">SIGNED</span>
                      </template>
                      <span v-else class="text-slate-600 text-[10px]">—</span>
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-center cursor-pointer" @dblclick="startEditColumn(col, 'nullable')" :class="{ 'text-amber-400': isColumnFieldModified(col, 'nullable') }">
                    <template v-if="editingColumn && editingColumnId === col._id && editingColumnField === 'nullable'">
                      <select 
                        v-model="editingColumn.nullable" 
                        @change="saveColumnEdit"
                        @blur="saveColumnEdit"
                        v-focus
                        @click.stop
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm text-slate-200"
                      >
                        <option :value="true">YES</option>
                        <option :value="false">NO</option>
                      </select>
                    </template>
                    <template v-else>
                      <span v-if="col.nullable" class="text-blue-400 text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-400/10">YES</span>
                      <span v-else class="text-slate-500 text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-500/10">NO</span>
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-center font-mono text-xs">
                    <span 
                      v-if="col.key" 
                      class="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 cursor-help"
                      :title="col.key === 'PRI' ? 'Primary Key' : col.key === 'UNI' ? 'Unique Key' : col.key === 'MUL' ? 'Multiple Key (Index)' : col.key"
                    >
                      {{ col.key }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-400 font-mono italic cursor-pointer" @dblclick="startEditColumn(col, 'default')" :class="{ 'text-amber-400': isColumnFieldModified(col, 'default') }">
                    <template v-if="editingColumn && editingColumnId === col._id && editingColumnField === 'default'">
                      <input 
                        v-model="editingColumn.default" 
                        @blur="saveColumnEdit" 
                        @keyup.enter="saveColumnEdit"
                        @keyup.escape="cancelEditColumn"
                        v-focus
                        @click.stop
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm"
                        placeholder="NULL"
                      />
                    </template>
                    <template v-else>
                      {{ col.default === null ? 'NULL' : col.default }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-500 font-mono text-xs">
                    {{ col.collation }}
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-500 font-mono text-xs max-w-xs truncate" :title="col.expression">
                    {{ col.expression }}
                  </td>
                  <td class="px-4 py-2 text-sm text-center">
                    <span v-if="col.virtuality" class="text-purple-400 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-400/10 border border-purple-400/20">
                      {{ col.virtuality }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-500 font-mono text-xs cursor-pointer" @dblclick="startEditColumn(col, 'extra')" :class="{ 'text-amber-400': isColumnFieldModified(col, 'extra') }">
                    <template v-if="editingColumn && editingColumnId === col._id && editingColumnField === 'extra'">
                      <input 
                        v-model="editingColumn.extra" 
                        @blur="saveColumnEdit" 
                        @keyup.enter="saveColumnEdit"
                        @keyup.escape="cancelEditColumn"
                        v-focus
                        @click.stop
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm"
                      />
                    </template>
                    <template v-else>
                      {{ col.extra }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-400 italic text-xs max-w-sm truncate cursor-pointer" @dblclick="startEditColumn(col, 'comment')" :title="col.comment" :class="{ 'text-amber-400': isColumnFieldModified(col, 'comment') }">
                    <template v-if="editingColumn && editingColumnId === col._id && editingColumnField === 'comment'">
                      <input 
                        v-model="editingColumn.comment" 
                        @blur="saveColumnEdit" 
                        @keyup.enter="saveColumnEdit"
                        @keyup.escape="cancelEditColumn"
                        v-focus
                        @click.stop
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm"
                      />
                    </template>
                    <template v-else>
                      {{ col.comment }}
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Resize Handle -->
        <div 
          class="h-3 flex items-center justify-center cursor-row-resize group"
          @mousedown="startResizing"
        >
          <div class="w-full h-px bg-slate-800 group-hover:bg-blue-500 transition-colors relative flex items-center justify-center">
            <div class="absolute bg-slate-900 border border-slate-700 rounded px-1 py-0.5 group-hover:border-blue-500 transition-colors">
              <GripHorizontal :size="12" class="text-slate-500 group-hover:text-blue-400" />
            </div>
          </div>
        </div>

        <!-- Bottom Block: Tabs (Indexes, FKs) -->
        <div class="flex-1 flex flex-col min-h-0 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <!-- Tabs Header -->
        <div class="flex border-b border-slate-800 flex-shrink-0 bg-slate-800/50 justify-between items-center pr-2">
          <div class="flex">
            <button 
              @click="bottomTab = 'indexes'"
              class="px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
              :class="bottomTab === 'indexes' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
            >
              <List :size="14" />
              Indices
            </button>
            <button 
              @click="bottomTab = 'fks'"
              class="px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
              :class="bottomTab === 'fks' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
            >
              <Link :size="14" />
              Foreign Keys
            </button>
          </div>
          <button 
            v-if="bottomTab === 'indexes'"
            @click="showAddIndex = !showAddIndex"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors"
            :class="showAddIndex ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10' : 'text-blue-400 hover:text-blue-300 hover:bg-blue-400/10'"
            :title="showAddIndex ? 'Cancel' : 'Añadir índice'"
          >
            <X v-if="showAddIndex" :size="14" />
            <Plus v-else :size="14" />
            {{ showAddIndex ? 'Cancel' : 'Add' }}
          </button>
          <button 
            v-else-if="bottomTab === 'fks'"
            @click="showAddFK = !showAddFK"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors"
            :class="showAddFK ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10' : 'text-blue-400 hover:text-blue-300 hover:bg-blue-400/10'"
            :title="showAddFK ? 'Cancelar' : 'Añadir foreign key'"
          >
            <X v-if="showAddFK" :size="14" />
            <Plus v-else :size="14" />
            {{ showAddFK ? 'Cancelar' : 'Add' }}
          </button>
        </div>

        <!-- Pending Changes Bar (Removed from here, moved up) -->

        <!-- Tab Content -->
        <div class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <div v-if="bottomTab === 'indexes'">
            <!-- Add Index Form -->
            <div v-if="showAddIndex" class="p-4 bg-slate-800/30 border-b border-slate-800">
              <div class="flex flex-wrap gap-4 items-end">
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Nombre del índice</label>
                  <input v-model="newIndex.name" type="text" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none" placeholder="Opcional" />
                </div>
                <div class="flex-[2] min-w-[300px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Columnas</label>
                  <MultiSelect v-model="newIndex.columns" :options="columnNames" placeholder="Selecciona columnas..." />
                </div>
                <div class="w-40">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Tipo de índice</label>
                  <select v-model="newIndex.type" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none">
                    <option value="INDEX">INDEX</option>
                    <option value="UNIQUE">UNIQUE</option>
                    <option value="PRIMARY">PRIMARY</option>
                    <option value="FULLTEXT">FULLTEXT</option>
                    <option value="SPATIAL">SPATIAL</option>
                  </select>
                </div>
                <div class="ml-auto mb-1">
                  <button 
                    @click="handleAddIndex" 
                    :disabled="saving || newIndex.columns.length === 0"
                    class="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                  >
                    <Loader2 v-if="saving" :size="14" class="animate-spin" />
                    Guardar
                  </button>
                </div>
              </div>
            </div>

            <table class="w-full text-left border-collapse table-auto">
              <thead class="sticky top-0 z-10 bg-slate-800 shadow-sm">
                <tr>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Name</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Columns</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Type</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Method</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700 w-10"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="idx in sortedIndexes" :key="idx.name" class="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0 transition-colors group relative" :class="{ 'bg-emerald-500/5 border-l-2 border-emerald-500/50': isIndexNew(idx), 'bg-amber-500/5 border-l-2 border-amber-500/50': !isIndexNew(idx) && isIndexModified(idx) }">
                  <td class="px-4 py-2 text-sm font-medium text-slate-100 cursor-pointer" @dblclick="startEditIndex(idx, 'name')" :class="{ 'text-amber-400': !isIndexNew(idx) && isIndexFieldModified(idx, 'name') }">
                    <template v-if="editingIndex && originalIndexName === idx.name && editingIndexField === 'name'">
                      <input 
                        v-model="editingIndex.name" 
                        @blur="saveIndexEdit" 
                        @keyup.enter="saveIndexEdit"
                        @keyup.escape="cancelEditIndex"
                        v-focus
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm"
                      />
                    </template>
                    <template v-else>
                      {{ idx.name }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-blue-400 font-mono cursor-pointer" @dblclick="startEditIndex(idx, 'columns')" :class="{ 'text-amber-400': !isIndexNew(idx) && isIndexFieldModified(idx, 'columns') }">
                    <template v-if="editingIndex && originalIndexName === idx.name && editingIndexField === 'columns'">
                       <MultiSelect 
                         v-model="editingIndex.columns" 
                         :options="columnNames" 
                         @close="saveIndexEdit"
                         class="min-w-[150px]"
                       />
                    </template>
                    <template v-else>
                      {{ idx.columns.join(', ') }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm cursor-pointer" @dblclick="startEditIndex(idx, 'type')" :class="{ 'text-amber-400': !isIndexNew(idx) && isIndexFieldModified(idx, 'type') }">
                    <template v-if="editingIndex && originalIndexName === idx.name && editingIndexField === 'type'">
                      <select 
                        v-model="editingIndex.type" 
                        @change="saveIndexEdit"
                        @blur="saveIndexEdit"
                        v-focus
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm text-slate-200"
                      >
                        <option value="INDEX">INDEX</option>
                        <option value="UNIQUE">UNIQUE</option>
                        <option value="PRIMARY">PRIMARY</option>
                        <option value="FULLTEXT">FULLTEXT</option>
                        <option value="SPATIAL">SPATIAL</option>
                      </select>
                    </template>
                    <template v-else>
                      <span 
                        class="text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase"
                        :class="[
                          idx.type === 'PRIMARY' ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' :
                          idx.type === 'UNIQUE' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                          idx.type === 'FULLTEXT' ? 'text-purple-400 bg-purple-400/10 border-purple-400/20' :
                          idx.type === 'SPATIAL' ? 'text-orange-400 bg-orange-400/10 border-orange-400/20' :
                          'text-slate-400 bg-slate-400/10 border-slate-400/20'
                        ]"
                      >
                        {{ idx.type }}
                      </span>
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-400 font-mono text-xs">{{ idx.method }}</td>
                  <td class="px-4 py-2 text-right">
                    <button 
                      @click="deleteIndex(idx)" 
                      class="p-1 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-all opacity-0 group-hover:opacity-100"
                      title="Eliminar índice"
                    >
                      <Trash2 :size="14" />
                    </button>
                  </td>
                </tr>
                <tr v-if="sortedIndexes.length === 0">
                  <td colspan="5" class="px-4 py-8 text-center text-slate-500 italic text-sm">No indexes found</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="bottomTab === 'fks'">
            <!-- Add FK Form -->
            <div v-if="showAddFK" class="p-4 bg-slate-800/30 border-b border-slate-800 space-y-4">
              <!-- Row 1: Name, Update Rule, Delete Rule, Save Button -->
              <div class="flex flex-wrap gap-4 items-end">
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Nombre FK</label>
                  <input v-model="newFK.name" type="text" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none" placeholder="Opcional" />
                </div>
                <div class="w-40">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Update Rule</label>
                  <select v-model="newFK.updateRule" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none">
                    <option value="CASCADE">CASCADE</option>
                    <option value="NO ACTION">NO ACTION</option>
                    <option value="RESTRICT">RESTRICT</option>
                    <option value="SET NULL">SET NULL</option>
                  </select>
                </div>
                <div class="w-40">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Delete Rule</label>
                  <select v-model="newFK.deleteRule" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none">
                    <option value="CASCADE">CASCADE</option>
                    <option value="NO ACTION">NO ACTION</option>
                    <option value="RESTRICT">RESTRICT</option>
                    <option value="SET NULL">SET NULL</option>
                  </select>
                </div>
                <div class="ml-auto">
                  <button 
                    @click="handleAddFK" 
                    :disabled="saving || newFK.columns.length === 0 || !newFK.referencedTable || newFK.referencedColumns.length === 0"
                    class="px-6 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                  >
                    <Loader2 v-if="saving" :size="14" class="animate-spin" />
                    Guardar FK
                  </button>
                </div>
              </div>

              <!-- Row 2: Local Columns, Ref Table, Ref Columns, Cancel Button -->
              <div class="flex flex-wrap gap-4 items-end">
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Columnas locales</label>
                  <MultiSelect v-model="newFK.columns" :options="columnNames" placeholder="Selecciona columnas locales..." />
                </div>
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Tabla referenciada</label>
                  <select v-model="newFK.referencedTable" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none">
                    <option value="">Selecciona una tabla</option>
                    <option v-for="t in availableTables" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Columnas referenciadas</label>
                  <MultiSelect 
                    v-model="newFK.referencedColumns" 
                    :options="getReferencedTableColumns(newFK.referencedTable)" 
                    :disabled="!newFK.referencedTable"
                    :placeholder="!newFK.referencedTable ? 'Selecciona una tabla primero' : 'Selecciona columnas referenciadas...'" 
                  />
                </div>
              </div>
            </div>

            <table class="w-full text-left border-collapse table-auto">
              <thead class="sticky top-0 z-10 bg-slate-800 shadow-sm">
                <tr>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Name</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Columns</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Ref Table</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Ref Columns</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Update Rule</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Delete Rule</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700 w-10"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="fk in foreignKeys" :key="fk.name" class="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0 transition-colors group relative" :class="{ 'bg-emerald-500/5 border-l-2 border-emerald-500/50': isFKNew(fk), 'bg-amber-500/5 border-l-2 border-amber-500/50': !isFKNew(fk) && isFKModified(fk) }">
                  <td class="px-4 py-2 text-sm font-medium text-slate-100 cursor-pointer" @dblclick="startEditFK(fk, 'name')" :class="{ 'text-amber-400': !isFKNew(fk) && isFKFieldModified(fk, 'name') }">
                    <template v-if="editingFK && originalFKName === fk.name && editingFKField === 'name'">
                      <input 
                        v-model="editingFK.name" 
                        @blur="saveFKEdit" 
                        @keyup.enter="saveFKEdit"
                        @keyup.escape="cancelEditFK"
                        v-focus
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm"
                      />
                    </template>
                    <template v-else>
                      {{ fk.name }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-blue-400 font-mono cursor-pointer" @dblclick="startEditFK(fk, 'columns')" :class="{ 'text-amber-400': !isFKNew(fk) && isFKFieldModified(fk, 'columns') }">
                    <template v-if="editingFK && originalFKName === fk.name && editingFKField === 'columns'">
                       <MultiSelect 
                         v-model="editingFK.columns" 
                         :options="columnNames" 
                         @close="saveFKEdit"
                         class="min-w-[150px]"
                       />
                    </template>
                    <template v-else>
                      {{ fk.columns.join(', ') }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-emerald-400 cursor-pointer" @dblclick="startEditFK(fk, 'referencedTable')" :class="{ 'text-amber-400': !isFKNew(fk) && isFKFieldModified(fk, 'referencedTable') }">
                    <template v-if="editingFK && originalFKName === fk.name && editingFKField === 'referencedTable'">
                      <select 
                        v-model="editingFK.referencedTable" 
                        @change="saveFKEdit"
                        @blur="saveFKEdit"
                        v-focus
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-sm text-slate-200"
                      >
                        <option v-for="t in availableTables" :key="t" :value="t">{{ t }}</option>
                      </select>
                    </template>
                    <template v-else>
                      {{ fk.referencedTable }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-blue-400 font-mono cursor-pointer" @dblclick="startEditFK(fk, 'referencedColumns')" :class="{ 'text-amber-400': !isFKNew(fk) && isFKFieldModified(fk, 'referencedColumns') }">
                    <template v-if="editingFK && originalFKName === fk.name && editingFKField === 'referencedColumns'">
                       <MultiSelect 
                         v-model="editingFK.referencedColumns" 
                         :options="getReferencedTableColumns(editingFK.referencedTable)" 
                         @close="saveFKEdit"
                         class="min-w-[150px]"
                       />
                    </template>
                    <template v-else>
                      {{ fk.referencedColumns.join(', ') }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-400 font-mono text-[10px] cursor-pointer" @dblclick="startEditFK(fk, 'updateRule')" :class="{ 'text-amber-400': !isFKNew(fk) && isFKFieldModified(fk, 'updateRule') }">
                    <template v-if="editingFK && originalFKName === fk.name && editingFKField === 'updateRule'">
                      <select 
                        v-model="editingFK.updateRule" 
                        @change="saveFKEdit"
                        @blur="saveFKEdit"
                        v-focus
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-xs text-slate-200"
                      >
                        <option value="CASCADE">CASCADE</option>
                        <option value="NO ACTION">NO ACTION</option>
                        <option value="RESTRICT">RESTRICT</option>
                        <option value="SET NULL">SET NULL</option>
                      </select>
                    </template>
                    <template v-else>
                      {{ fk.updateRule }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-400 font-mono text-[10px] cursor-pointer" @dblclick="startEditFK(fk, 'deleteRule')" :class="{ 'text-amber-400': !isFKNew(fk) && isFKFieldModified(fk, 'deleteRule') }">
                    <template v-if="editingFK && originalFKName === fk.name && editingFKField === 'deleteRule'">
                      <select 
                        v-model="editingFK.deleteRule" 
                        @change="saveFKEdit"
                        @blur="saveFKEdit"
                        v-focus
                        class="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full outline-none text-xs text-slate-200"
                      >
                        <option value="CASCADE">CASCADE</option>
                        <option value="NO ACTION">NO ACTION</option>
                        <option value="RESTRICT">RESTRICT</option>
                        <option value="SET NULL">SET NULL</option>
                      </select>
                    </template>
                    <template v-else>
                      {{ fk.deleteRule }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-right">
                    <button 
                      @click="deleteFK(fk)" 
                      class="p-1 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-all opacity-0 group-hover:opacity-100"
                      title="Eliminar Foreign Key"
                    >
                      <Trash2 :size="14" />
                    </button>
                  </td>
                </tr>
                <tr v-if="foreignKeys.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-slate-500 italic text-sm">No foreign keys found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>
    </template>
    <CodeModal 
      :show="showCodeModal" 
      :title="codeModalTitle" 
      :code="codeModalContent" 
      @close="showCodeModal = false" 
    />
  </div>
</template>
