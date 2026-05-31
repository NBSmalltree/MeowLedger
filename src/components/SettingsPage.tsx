import { useState, useEffect } from 'react';
import { dataService } from '../services/data-service';
import type { Member } from '../types/index';

const PRESET_COLORS = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];

export function SettingsPage() {
  const [confirmStep, setConfirmStep] = useState(0);
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const refreshMembers = async () => {
    const data = await dataService.getMembers();
    setMembers(data);
  };

  useEffect(() => { refreshMembers(); }, []);

  const handleAddMember = async () => {
    if (!newName.trim()) return;
    const r = await dataService.addMember({ name: newName.trim(), color: newColor });
    if (r.success) {
      setNewName('');
      setShowAddMember(false);
      refreshMembers();
    }
  };

  const handleUpdateMember = async (id: number, name: string, color: string) => {
    await dataService.updateMember(id, { name, color });
    setEditingMember(null);
    refreshMembers();
  };

  const handleDeleteMember = async (id: number, name: string) => {
    if (!confirm(`确定删除成员"${name}"？如果该成员有关联的交易记录，将无法删除。`)) return;
    const r = await dataService.deleteMember(id);
    if (!r.success && r.hasTransactions) {
      alert(`无法删除"${name}"，该成员有关联的交易记录。请先将相关交易转移给其他成员或删除。`);
    }
    refreshMembers();
  };

  const handleClear = async () => {
    if (confirmStep === 0) { setConfirmStep(1); return; }
    if (confirmStep === 1) { setConfirmStep(2); return; }
    if (confirmStep === 2 && confirmText === '确认清空') {
      setClearing(true);
      try {
        await dataService.clearAllData();
        setResult('所有数据已清空');
        setConfirmStep(0);
        setConfirmText('');
        refreshMembers();
      } catch { setResult('清空失败'); }
      setClearing(false);
    }
  };

  const cancelClear = () => { setConfirmStep(0); setConfirmText(''); };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">设置</h2>

      {/* Family Members */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">家庭成员</h3>
            <p className="text-sm text-gray-500">管理参与记账的家庭成员</p>
          </div>
          <button onClick={() => setShowAddMember(true)}
            className="px-4 py-1.5 bg-cat-500 text-white rounded-lg text-sm hover:bg-cat-600 transition">
            + 添加成员
          </button>
        </div>

        <div className="space-y-3">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              {editingMember?.id === member.id ? (
                <EditMemberInline member={member}
                  onSave={(name, color) => handleUpdateMember(member.id, name, color)}
                  onCancel={() => setEditingMember(null)} />
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: member.color }}>
                      {member.name[0]}
                    </div>
                    <span className="font-medium text-gray-900">{member.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditingMember(member)}
                      className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition">
                      编辑
                    </button>
                    <button onClick={() => handleDeleteMember(member.id, member.name)}
                      className="px-3 py-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add Member Inline */}
        {showAddMember && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="成员名称"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cat-400"
                onKeyDown={e => e.key === 'Enter' && handleAddMember()} />
              <div className="flex items-center gap-1.5">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition ${newColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <button onClick={handleAddMember} disabled={!newName.trim()}
                className="px-4 py-2 text-sm bg-cat-500 text-white rounded-lg hover:bg-cat-600 transition disabled:opacity-40">
                确定
              </button>
              <button onClick={() => { setShowAddMember(false); setNewName(''); }}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h3 className="text-lg font-semibold text-red-700 mb-2">危险操作</h3>
        <p className="text-sm text-gray-500 mb-4">以下操作不可恢复，请谨慎使用。</p>

        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-medium text-red-800">清空所有数据</div>
              <div className="text-xs text-red-600">删除所有交易记录、对账组、导入历史</div>
            </div>
          </div>

          {confirmStep === 0 && (
            <button onClick={handleClear}
              className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition">
              清空所有数据
            </button>
          )}

          {confirmStep === 1 && (
            <div className="space-y-3">
              <div className="text-sm text-red-700 font-medium">⚠️ 第一次确认：确定要清空所有数据吗？此操作不可恢复！</div>
              <div className="flex gap-2">
                <button onClick={handleClear}
                  className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition">
                  确定，继续
                </button>
                <button onClick={cancelClear}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  取消
                </button>
              </div>
            </div>
          )}

          {confirmStep === 2 && (
            <div className="space-y-3">
              <div className="text-sm text-red-700 font-medium">⚠️ 第二次确认：请输入"确认清空"四个字</div>
              <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                placeholder="输入：确认清空"
                className="px-3 py-2 border border-red-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className="flex gap-2">
                <button onClick={handleClear} disabled={confirmText !== '确认清空' || clearing}
                  className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition disabled:opacity-40">
                  {clearing ? '清空中...' : '确认清空'}
                </button>
                <button onClick={cancelClear}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  取消
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-3 text-sm text-green-700 bg-green-50 rounded p-2">{result}</div>
          )}
        </div>
      </div>

      {/* About */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">关于</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>🐱 喵喵账本 v1.0.0</p>
          <p>家庭财务对账系统，核心解决退款轧差对账难题</p>
          <p className="text-xs text-gray-400 mt-3">数据完全存储在本地，不会上传到任何服务器</p>
        </div>
      </div>
    </div>
  );
}

function EditMemberInline({ member, onSave, onCancel }: {
  member: Member; onSave: (name: string, color: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [color, setColor] = useState(member.color);

  return (
    <div className="flex items-center gap-3 w-full">
      <input type="text" value={name} onChange={e => setName(e.target.value)}
        className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cat-400"
        onKeyDown={e => e.key === 'Enter' && onSave(name, color)} />
      <div className="flex items-center gap-1.5">
        {['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'].map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      <button onClick={() => onSave(name, color)}
        className="px-3 py-1.5 text-xs bg-cat-500 text-white rounded-lg hover:bg-cat-600 transition">
        保存
      </button>
      <button onClick={onCancel}
        className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition">
        取消
      </button>
    </div>
  );
}
