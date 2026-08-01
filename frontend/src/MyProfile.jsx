import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UserAdminEdit from './UserAdminEdit';

export default function MyProfile({ loggedInUser }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (loggedInUser) {
      fetch(`/api/users/username/${loggedInUser}`)
        .then(res => res.json())
        .then(data => {
          setUser(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load profile:', err);
          setLoading(false);
        });
    }
  }, [loggedInUser]);

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading profile...</div>;
  }

  if (!user || user.message === 'User not found') {
    return <div style={{ padding: '20px' }}>User not found.</div>;
  }

  return <UserAdminEdit user={user} onBack={() => navigate('/')} />;
}
