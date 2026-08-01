import { useState } from 'react';
import UserAdminList from './UserAdminList';
import UserAdminEdit from './UserAdminEdit';
import './UserAdmin.css';

const UserAdmin = () => {
  const [currentView, setCurrentView] = useState('list'); // 'list' | 'edit'
  const [selectedUser, setSelectedUser] = useState(null);

  const navigateToEdit = (user) => {
    setSelectedUser(user);
    setCurrentView('edit');
  };

  const navigateToList = () => {
    setSelectedUser(null);
    setCurrentView('list');
  };

  return (
    <div className="user-admin-wrapper">
      {currentView === 'list' && (
        <UserAdminList onEdit={navigateToEdit} />
      )}
      {currentView === 'edit' && selectedUser && (
        <UserAdminEdit user={selectedUser} onBack={navigateToList} />
      )}
    </div>
  );
};

export default UserAdmin;
