import { useState, useEffect, useRef } from 'react';
import { User, ChevronDown } from 'lucide-react';
import api from '../services/api';

function Avatar({ profile }){
  const size = 'w-8 h-8';
  if (profile && profile.pictureUrl) {
    return <img src={profile.pictureUrl} alt="avatar" className={`${size} rounded-full object-cover`} />;
  }
  // default gender-based icon
  if (profile && profile.gender === 'female'){
    return (
      <div className={`${size} rounded-full bg-pink-200 flex items-center justify-center text-pink-700 font-semibold`}>♀</div>
    );
  }
  if (profile && profile.gender === 'male'){
    return (
      <div className={`${size} rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-semibold`}>♂</div>
    );
  }
  // fallback: initials or generic user icon
  if (profile && (profile.firstName || profile.lastName)){
    const initials = `${(profile.firstName||'')[0] || ''}${(profile.lastName||'')[0] || ''}`.toUpperCase();
    return <div className={`${size} rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold`}>{initials}</div>;
  }
  return <div className={`${size} rounded-full bg-gray-200 flex items-center justify-center text-gray-700`}><User className="w-4 h-4" /></div>;
}

export default function ProfileMenu(){
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const menuRef = useRef();

  useEffect(()=>{
    let mounted = true;
    api.getCurrentUser().then(u=>{
      if (!mounted) return;
      setUser(u);
      // load saved profile from localStorage by username
      try{
        const key = `profile:${u.username}`;
        const saved = localStorage.getItem(key);
        if (saved) setProfile(JSON.parse(saved));
        else setProfile({ firstName: '', lastName: '', gender: '', pictureUrl: '' });
      }catch(e){ setProfile({ firstName: '', lastName: '', gender: '', pictureUrl: '' }); }
    }).catch(()=>{});
    return ()=>{ mounted=false };
  },[]);

  useEffect(()=>{
    const onDoc = (e)=>{ if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return ()=> document.removeEventListener('click', onDoc);
  },[]);

  const doLogout = async ()=>{
    await api.logoutRemote();
    api.logout();
    window.location.href = '/';
  };

  const saveProfile = ()=>{
    if (!user) return;
    const key = `profile:${user.username}`;
    localStorage.setItem(key, JSON.stringify(profile));
    setProfileOpen(false);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={()=>setOpen(s=>!s)} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100">
        <Avatar profile={profile} />
        <span className="text-sm text-gray-700 hidden sm:inline">{(profile && (profile.firstName || profile.lastName)) ? `${profile.firstName} ${profile.lastName}` : user.username}</span>
        <ChevronDown className="w-4 h-4 text-gray-500" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border rounded shadow-lg z-50">
          <div className="p-3 border-b">
            <div className="flex items-center gap-3">
              <Avatar profile={profile} />
              <div>
                <div className="font-medium text-gray-800">{(profile && (profile.firstName || profile.lastName)) ? `${profile.firstName} ${profile.lastName}` : user.username}</div>
                <div className="text-xs text-gray-500">{user.email || ''}</div>
              </div>
            </div>
          </div>
          <div className="p-2">
            <button onClick={()=>{ setProfileOpen(true); setOpen(false); }} className="w-full text-left px-3 py-2 rounded hover:bg-gray-50">Edit profile</button>
            <button onClick={doLogout} className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 text-red-600">Logout</button>
          </div>
        </div>
      )}

      {profileOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Complete your profile</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600">First name</label>
                <input value={profile.firstName} onChange={(e)=>setProfile({...profile, firstName: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Last name</label>
                <input value={profile.lastName} onChange={(e)=>setProfile({...profile, lastName: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Gender</label>
                <select value={profile.gender} onChange={(e)=>setProfile({...profile, gender: e.target.value})} className="w-full border rounded px-3 py-2 mt-1">
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setProfileOpen(false)} className="px-4 py-2 rounded border">Cancel</button>
              <button onClick={saveProfile} className="px-4 py-2 rounded bg-primary-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
